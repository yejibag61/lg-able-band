from __future__ import annotations

from pathlib import Path

from utils import ensure_directory, timestamp_id


def _import_audio_dependencies():
    try:
        import sounddevice as sounddevice
        import soundfile as soundfile
    except ModuleNotFoundError as exc:
        raise ModuleNotFoundError(
            "Desktop microphone recording requires 'sounddevice' and 'soundfile'. "
            "Install them with 'pip install -r requirements.txt'."
        ) from exc

    return sounddevice, soundfile


def list_input_devices() -> list[dict[str, str | int | float]]:
    sounddevice, _ = _import_audio_dependencies()

    devices: list[dict[str, str | int | float]] = []
    for index, device in enumerate(sounddevice.query_devices()):
        if int(device["max_input_channels"]) <= 0:
            continue

        devices.append(
            {
                "index": index,
                "name": str(device["name"]),
                "max_input_channels": int(device["max_input_channels"]),
                "default_samplerate": float(device["default_samplerate"]),
            }
        )

    return devices


def print_input_devices() -> None:
    devices = list_input_devices()
    if not devices:
        print("No microphone input devices were found.")
        return

    print("Available microphone input devices:")
    for device in devices:
        print(
            f"  [{device['index']}] {device['name']} "
            f"(channels={device['max_input_channels']}, default_sr={device['default_samplerate']:.0f})"
        )


def record_microphone_audio(
    output_dir: Path,
    sample_rate: int,
    duration_seconds: float,
    label_prefix: str,
    device_index: int | None = None,
) -> Path:
    sounddevice, soundfile = _import_audio_dependencies()

    ensure_directory(output_dir)

    frame_count = int(sample_rate * duration_seconds)
    if frame_count <= 0:
        raise ValueError("Recording duration must be greater than 0 seconds.")

    output_path = output_dir / f"{label_prefix}-{timestamp_id()}.wav"

    print(
        f"Recording from desktop microphone for {duration_seconds:.1f} seconds "
        f"at {sample_rate}Hz..."
    )
    if device_index is not None:
        print(f"Using input device index: {device_index}")

    recording = sounddevice.rec(
        frame_count,
        samplerate=sample_rate,
        channels=1,
        dtype="float32",
        device=device_index,
    )
    sounddevice.wait()
    soundfile.write(output_path, recording, sample_rate)

    print(f"Saved recording: {output_path}")
    return output_path.resolve()
