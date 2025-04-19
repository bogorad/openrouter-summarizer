#!/usr/bin/env bash

export AIDER_EDITOR=nvim
docker pull paulgauthier/aider-full
docker run -it --user $(id -u):$(id -g) --volume $(pwd):/app paulgauthier/aider-full --chat-mode ask
