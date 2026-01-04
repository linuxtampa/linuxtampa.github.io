#!/bin/bash -x -e -u -o pipefail
cp ~/symlink-resume-2025/Tim-Bailey-Jones-Resume-*.pdf _site
npm run build
gcloud storage rsync _site/. gs://linuxtampa.com --recursive
gcloud compute url-maps invalidate-cdn-cache website-url-map --global --path=/*  # --async 
