#!/bin/bash -x -e -u -o pipefail
npm run build
gcloud storage rsync _site/. gs://linuxtampa.com --recursive
gcloud compute url-maps invalidate-cdn-cache website-url-map --global --path=/*  # --async 
