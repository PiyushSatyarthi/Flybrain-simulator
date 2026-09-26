#!/usr/bin/env bash
# Downloads the raw FlyWire data needed by build/preprocess.py into data/raw/.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/raw/codex
# FlyWire Codex exports (FAFB v783), mirrored in snedea/flybrain
BASE=https://github.com/snedea/flybrain/raw/main/data
for f in neurons.csv.gz connections.csv.gz coordinates.csv.gz; do
  echo "downloading $f"; curl -fL -o "data/raw/codex/$f" "$BASE/$f"
done
# Cell-type annotations (Schlegel et al. 2024)
echo "downloading annotations"
curl -fL -o data/raw/Supplemental_file1_neuron_annotations.tsv \
  https://github.com/flyconnectome/flywire_annotations/raw/main/supplemental_files/Supplemental_file1_neuron_annotations.tsv
echo "done. Now run: python3 build/preprocess.py"
