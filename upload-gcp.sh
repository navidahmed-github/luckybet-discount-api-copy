#!/bin/bash
if [[ "$1" = "-h"  || "$1" = "--help" ]]; then
    echo 'upload-gcp [label]'
    exit 0
else
    HASH=$(git rev-parse HEAD)
    [[ -z "$1" ]] && LABEL=${HASH:0:6} || LABEL="$1" 
    $(gcloud builds submit --substitutions=_TAG="$LABEL")
fi
