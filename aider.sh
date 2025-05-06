#!/usr/bin/env bash

export AIDER_EDITOR=nvim

# Check if running on NixOS
if [[ -d /etc/nixos ]] || grep -q "ID=nixos" /etc/os-release 2>/dev/null; then
    echo "Running on NixOS, using native aider"
    aider 
else
    echo "Not on NixOS, using Docker"
    docker pull paulgauthier/aider-full
    docker run -it --user $(id -u):$(id -g) --volume $(pwd):/app paulgauthier/aider-full --chat-mode ask
fi
