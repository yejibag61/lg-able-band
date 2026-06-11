from __future__ import annotations

import argparse
import shutil
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
from registry import append_registry_entry
from utils import (
    ensure_directory,
    load_config,
    resolve_project_path,
    select_device,
    slugify_name,
    timestamp_id,
)


def register_sound(
    audio_paths: list[str | Path],
    registered_sound_name: str,
    sound_type: str | None = None,
    notes: str = "",
    config_path: str | Path | None = None,
) -> list[dict[str, str]]:
    config = load_config(config_path)
    device = select_device(config["project"]["device"])

    model_name = config["embedding"]["pretrained_model_name"]
    pooling_strategy = config["embedding"]["pooling_strategy"]
    sample_rate = int(config["data"]["sample_rate"])
    clip_duration_seconds = float(config["data"]["clip_duration_seconds"])
    target_num_samples = int(sample_rate * clip_duration_seconds)

    enrollments_dir = ensure_directory(resolve_project_path(config["data"]["enrollments_dir"]))
    embeddings_dir = ensure_directory(resolve_project_path(config["outputs"]["embeddings_dir"]))
    registry_path = resolve_project_path(config["outputs"]["registry_file"])
    sound_dir = ensure_directory(enrollments_dir / slugify_name(registered_sound_name))

    feature_extractor = build_feature_extractor(model_name, sample_rate)
    embedding_model = build_embedding_model(model_name)

    results: list[dict[str, str]] = []

    for audio_path_value in audio_paths:
        audio_path = Path(audio_path_value).resolve()
        waveform = load_audio(audio_path, sample_rate)
        waveform = prepare_waveform(waveform, target_num_samples)
        embedding = extract_audio_embedding(
            model=embedding_model,
            feature_extractor=feature_extractor,
            waveform=waveform.squeeze(0).numpy(),
            sample_rate=sample_rate,
            device=device,
            pooling_strategy=pooling_strategy,
        )

        entry_id = timestamp_id()
        enrollment_audio_path = sound_dir / f"{entry_id}{audio_path.suffix.lower()}"
        shutil.copy2(audio_path, enrollment_audio_path)
        embedding_path = embeddings_dir / f"{entry_id}.npy"
        np.save(embedding_path, embedding)

        entry = {
            "id": entry_id,
            "registered_sound_name": registered_sound_name,
            "sound_type": sound_type,
            "source_audio_path": str(audio_path),
            "enrollment_audio_path": str(enrollment_audio_path),
            "embedding_path": str(embedding_path),
            "sample_rate": sample_rate,
            "clip_duration_seconds": clip_duration_seconds,
            "model_name": model_name,
            "notes": notes,
            "enrolled_at": entry_id,
        }
        append_registry_entry(registry_path, entry)

        results.append(
            {
                "registered_sound_name": registered_sound_name,
                "sound_type": sound_type or "",
                "source_audio_path": str(audio_path),
                "enrollment_audio_path": str(enrollment_audio_path),
                "embedding_path": str(embedding_path),
            }
        )

    return results


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Register one or more user-recorded alert sounds for future matching."
    )
    parser.add_argument(
        "--audio-path",
        nargs="+",
        default=None,
        help="One or more wav/mp3 files that represent the same registered sound.",
    )
    parser.add_argument(
        "--record-seconds",
        type=float,
        default=None,
        help="Record from the desktop microphone for this many seconds before enrollment.",
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
    parser.add_argument(
        "--name",
        default=None,
        help="Registered sound name, such as 'Our Apartment Broadcast'.",
    )
    parser.add_argument(
        "--type",
        dest="sound_type",
        default=None,
        help="Sound type such as apartment_announcement, doorbell, or fire_alarm.",
    )
    parser.add_argument(
        "--notes",
        default="",
        help="Optional note about the sound source.",
    )
    parser.add_argument("--config", type=str, default=None, help="Path to a YAML config file.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if args.list_input_devices:
        print_input_devices()
        return

    if not args.name:
        raise SystemExit("Provide --name unless you are only using --list-input-devices.")

    audio_paths: list[str | Path] = list(args.audio_path or [])
    if args.record_seconds is not None:
        config = load_config(args.config)
        test_audio_dir = ensure_directory(resolve_project_path(config["data"]["test_audio_dir"]))
        recorded_path = record_microphone_audio(
            output_dir=test_audio_dir,
            sample_rate=int(config["data"]["sample_rate"]),
            duration_seconds=args.record_seconds,
            label_prefix=f"desktop-enroll-{slugify_name(args.name)}",
            device_index=args.device_index,
        )
        audio_paths.append(recorded_path)

    if not audio_paths:
        raise SystemExit("Provide --audio-path or --record-seconds.")

    results = register_sound(
        audio_paths=audio_paths,
        registered_sound_name=args.name,
        sound_type=args.sound_type,
        notes=args.notes,
        config_path=args.config,
    )

    for result in results:
        print(f"Registered: {result['registered_sound_name']}")
        print(f"  source: {result['source_audio_path']}")
        print(f"  enrollment copy: {result['enrollment_audio_path']}")
        print(f"  embedding: {result['embedding_path']}")

    config = load_config(args.config)
    registry_path = resolve_project_path(config["outputs"]["registry_file"])
    print(f"Registry updated: {registry_path}")


if __name__ == "__main__":
    main()
