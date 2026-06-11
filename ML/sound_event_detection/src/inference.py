from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from desktop_audio import print_input_devices, record_microphone_audio
from embedding import (
    build_embedding_model,
    build_feature_extractor,
    extract_audio_embedding,
    load_audio,
    prepare_waveform,
)
from registry import load_registry
from utils import cosine_similarity, load_config, resolve_project_path, save_json, select_device, timestamp_id


SOUND_TYPE_KOREAN_LABELS = {
    "apartment_announcement": "아파트 방송 안내음",
    "doorbell": "초인종",
    "fire_alarm": "화재경보음",
    "appliance_done": "가전 완료음",
    "background_noise": "생활 배경 소음",
    "unknown": "알 수 없는 소리",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Match a new audio file against registered user enrollment sounds."
    )
    parser.add_argument("--audio-path", default=None, help="Path to a wav or mp3 file.")
    parser.add_argument(
        "--record-seconds",
        type=float,
        default=None,
        help="Record from the desktop microphone for this many seconds before inference.",
    )
    parser.add_argument(
        "--device-index",
        type=int,
        default=None,
        help="Optional desktop microphone input device index.",
    )
    parser.add_argument(
        "--list-input-devices",
        action="store_true",
        help="Print available desktop microphone devices and exit.",
    )
    parser.add_argument("--threshold", type=float, default=None, help="Override similarity threshold.")
    parser.add_argument("--top-k", type=int, default=None, help="How many ranked candidates to include.")
    parser.add_argument("--save-json", action="store_true", help="Save the result JSON under outputs/reports.")
    parser.add_argument("--config", type=str, default=None, help="Path to a YAML config file.")
    return parser.parse_args()


def build_ranked_matches(entries: list[dict], query_embedding: np.ndarray) -> list[dict]:
    ranked_matches: list[dict] = []

    for entry in entries:
        embedding_path = Path(entry["embedding_path"])
        if not embedding_path.exists():
            continue

        enrolled_embedding = np.load(embedding_path)
        similarity = cosine_similarity(query_embedding, enrolled_embedding)
        ranked_matches.append(
            {
                "enrollment_id": entry["id"],
                "registered_sound_name": entry["registered_sound_name"],
                "sound_type": entry["sound_type"],
                "similarity": similarity,
                "enrollment_audio_path": entry["enrollment_audio_path"],
                "source_audio_path": entry["source_audio_path"],
            }
        )

    return sorted(ranked_matches, key=lambda item: item["similarity"], reverse=True)


def to_korean_sound_type(sound_type: str | None) -> str:
    if not sound_type:
        return SOUND_TYPE_KOREAN_LABELS["unknown"]
    return SOUND_TYPE_KOREAN_LABELS.get(sound_type, sound_type)


def build_korean_message(
    predicted: bool,
    registered_sound_name: str,
    sound_type: str,
    similarity: float,
    threshold: float,
) -> str:
    similarity_text = f"{similarity:.2f}"
    threshold_text = f"{threshold:.2f}"
    sound_type_korean = to_korean_sound_type(sound_type)

    if predicted:
        return (
            f"등록된 소리 '{registered_sound_name}'이(가) 감지되었습니다. "
            f"유형은 '{sound_type_korean}'이고 유사도는 {similarity_text}입니다."
        )

    return (
        f"등록된 소리와의 최고 유사도가 {similarity_text}로 기준값 {threshold_text}보다 낮아 "
        "미등록 소리로 판단했습니다."
    )


def run_inference(
    audio_path_value: str | Path,
    threshold: float | None = None,
    top_k: int | None = None,
    config_path: str | Path | None = None,
) -> dict:
    config = load_config(config_path)
    device = select_device(config["project"]["device"])

    model_name = config["embedding"]["pretrained_model_name"]
    pooling_strategy = config["embedding"]["pooling_strategy"]
    resolved_threshold = float(threshold if threshold is not None else config["matching"]["similarity_threshold"])
    resolved_top_k = int(top_k if top_k is not None else config["matching"]["top_k"])
    unknown_label = str(config["matching"]["unknown_label"])

    sample_rate = int(config["data"]["sample_rate"])
    clip_duration_seconds = float(config["data"]["clip_duration_seconds"])
    target_num_samples = int(sample_rate * clip_duration_seconds)

    registry_path = resolve_project_path(config["outputs"]["registry_file"])
    registry = load_registry(registry_path)
    entries = registry.get("entries", [])
    if not entries:
        raise ValueError(
            f"No enrollment entries were found in {registry_path}. "
            "Run enroll.py first."
        )

    feature_extractor = build_feature_extractor(model_name, sample_rate)
    embedding_model = build_embedding_model(model_name)

    audio_path = Path(audio_path_value).resolve()
    waveform = load_audio(audio_path, sample_rate)
    waveform = prepare_waveform(waveform, target_num_samples)
    query_embedding = extract_audio_embedding(
        model=embedding_model,
        feature_extractor=feature_extractor,
        waveform=waveform.squeeze(0).numpy(),
        sample_rate=sample_rate,
        device=device,
        pooling_strategy=pooling_strategy,
    )

    ranked_matches = build_ranked_matches(entries, query_embedding)
    for match in ranked_matches:
        match["sound_type_korean"] = to_korean_sound_type(match.get("sound_type"))

    top_matches = ranked_matches[:resolved_top_k]
    best_match = top_matches[0] if top_matches else None
    predicted = bool(best_match and best_match["similarity"] >= resolved_threshold)
    registered_sound_name = (
        best_match["registered_sound_name"] if predicted and best_match else unknown_label
    )
    sound_type = best_match["sound_type"] if predicted and best_match else unknown_label
    similarity = best_match["similarity"] if best_match else 0.0

    return {
        "audio_path": str(audio_path),
        "predicted": predicted,
        "registered_sound_name": registered_sound_name,
        "sound_type": sound_type,
        "sound_type_korean": to_korean_sound_type(sound_type),
        "similarity": similarity,
        "threshold": resolved_threshold,
        "korean_message": build_korean_message(
            predicted=predicted,
            registered_sound_name=registered_sound_name,
            sound_type=sound_type,
            similarity=similarity,
            threshold=resolved_threshold,
        ),
        "top_matches": top_matches,
    }


def main() -> None:
    args = parse_args()
    if args.list_input_devices:
        print_input_devices()
        return

    audio_path_value = args.audio_path
    if args.record_seconds is not None:
        config = load_config(args.config)
        test_audio_dir = resolve_project_path(config["data"]["test_audio_dir"])
        audio_path_value = record_microphone_audio(
            output_dir=test_audio_dir,
            sample_rate=int(config["data"]["sample_rate"]),
            duration_seconds=args.record_seconds,
            label_prefix="desktop-inference",
            device_index=args.device_index,
        )

    if audio_path_value is None:
        raise SystemExit("Provide --audio-path or --record-seconds.")

    result = run_inference(
        audio_path_value=audio_path_value,
        threshold=args.threshold,
        top_k=args.top_k,
        config_path=args.config,
    )

    print(json.dumps(result, indent=2, ensure_ascii=False))

    if args.save_json:
        config = load_config(args.config)
        reports_dir = resolve_project_path(config["outputs"]["reports_dir"])
        report_path = reports_dir / f"inference-{timestamp_id()}.json"
        save_json(report_path, result)
        print(f"Saved report: {report_path}")


if __name__ == "__main__":
    main()
