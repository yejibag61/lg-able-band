# Able Band Sound Event Matching

`ML/sound_event_detection/` is a standalone Python module for user-personalized alert-sound matching.

Instead of predicting only from a fixed class set, this module lets a user:

1. register a real alert sound with a custom name and type
2. store one or more enrollment examples
3. compare a new sound against those saved examples with cosine similarity

## Project Overview

Example flow:

1. A user records an apartment broadcast start chime.
2. The user registers it as `Our Apartment Broadcast`.
3. The user stores the type `apartment_announcement`.
4. Later, a similar sound is recorded again.
5. The module compares it against registered enrollment sounds.
6. If the similarity is high enough, it returns that registered sound.

## Fixed Classification vs User Enrollment Matching

Fixed-class classification:

- assumes a predefined small label set
- predicts one class directly
- needs a larger labeled dataset

User enrollment matching:

- stores the user's own real alert sounds
- keeps metadata such as name and type
- compares a new sound against saved embeddings
- fits the Able Band use case better because every home can have different sounds

## Enrollment Concept

Enrollment means saving one or more reference clips for a user-defined alert sound.

For each enrollment clip, the module stores:

- `registered_sound_name`
- `sound_type`
- copied enrollment audio file
- embedding vector
- source file path
- timestamp

Multiple enrollment clips can belong to the same sound name, and one type can contain many different user-defined sounds.

## Embedding and Cosine Similarity Matching

The module uses a pretrained audio model as a feature extractor.

Flow:

1. load audio
2. convert to mono and normalize
3. resample to the configured sample rate
4. extract embedding
5. compare with registered embeddings using cosine similarity
6. if the best score is above threshold, return the matched sound
7. if not, return `unknown`

## Folder Structure

```text
ML/
  sound_event_detection/
    data/
      enrollments/
      test_audio/
    configs/
      config.yaml
    src/
      desktop_audio.py
      enroll.py
      inference.py
      evaluate.py
      embedding.py
      registry.py
      utils.py
    outputs/
      embeddings/
      reports/
      registry/
    README.md
    requirements.txt
```

## Installation

```bash
cd ML/sound_event_detection
py -3.12 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Desktop microphone testing on a PC now uses:

- `sounddevice`
- `soundfile`

If Windows asks for microphone permission, allow Python or your terminal app to access the microphone.

## Prepare Audio Files

Put input audio files under:

- `data/test_audio/`

Example:

```text
data/
  test_audio/
    apartment_chime.wav
    new_sound.wav
    bell1.mp3
```

Registered enrollment copies are automatically stored under:

- `data/enrollments/`

## Register a Sound

Register from an existing audio file:

```bash
python src/enroll.py --audio-path data/test_audio/apartment_chime.wav --name "Our Apartment Broadcast" --type apartment_announcement
```

Register multiple examples for the same sound:

```bash
python src/enroll.py --audio-path data/test_audio/bell1.mp3 data/test_audio/bell2.mp3 --name "Front Door Bell" --type doorbell
```

Register directly from the desktop microphone:

```bash
python src/enroll.py --record-seconds 4 --name "Desktop Doorbell" --type doorbell
```

List available PC microphones:

```bash
python src/enroll.py --list-input-devices
```

Use a specific PC microphone:

```bash
python src/enroll.py --record-seconds 4 --device-index 1 --name "Desktop Doorbell" --type doorbell
```

## Run Inference

Run inference from an existing audio file:

```bash
python src/inference.py --audio-path data/test_audio/new_sound.wav
```

Run inference from the desktop microphone:

```bash
python src/inference.py --record-seconds 4
```

List available PC microphones:

```bash
python src/inference.py --list-input-devices
```

Use a specific PC microphone:

```bash
python src/inference.py --record-seconds 4 --device-index 1
```

Example output:

```json
{
  "predicted": true,
  "registered_sound_name": "Our Apartment Broadcast",
  "sound_type": "apartment_announcement",
  "similarity": 0.87,
  "threshold": 0.8
}
```

If the score is below threshold, the module returns:

```json
{
  "predicted": false,
  "registered_sound_name": "unknown",
  "sound_type": "unknown",
  "similarity": 0.42,
  "threshold": 0.8
}
```

## Threshold Tuning

You can change the threshold in:

- `configs/config.yaml`

Relevant keys:

- `matching.similarity_threshold`
- `matching.top_k`
- `matching.unknown_label`

General rule:

- higher threshold: fewer false matches, more misses
- lower threshold: more matches, higher confusion risk

## Desktop Test Flow

For quick PC testing before phone integration:

1. register one or more sounds with `--record-seconds`
2. play the same alert sound again near the computer microphone
3. run inference with `--record-seconds`
4. check the predicted sound name and similarity score

Recorded desktop test clips are saved under `data/test_audio/`, so you can reuse them later.

## Able Band Service Connection

This module is independent for now, but it is designed for later integration.

Suggested service flow:

1. app or wearable records audio
2. backend receives the file
3. backend calls enrollment or inference logic
4. backend returns the matched sound name, type, and similarity

## Future Backend and App IO Contract

Enrollment input:

```json
{
  "audio_file": "uploaded wav/mp3",
  "registered_sound_name": "Our Apartment Broadcast",
  "sound_type": "apartment_announcement"
}
```

Inference input:

```json
{
  "audio_file": "uploaded wav/mp3"
}
```

Inference output:

```json
{
  "predicted": true,
  "registered_sound_name": "Our Apartment Broadcast",
  "sound_type": "apartment_announcement",
  "similarity": 0.87,
  "threshold": 0.8
}
```
