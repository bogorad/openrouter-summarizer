{
  description = "Summarizer Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    opencode-flake.url = "github:aodhanhayter/opencode-flake";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      opencode-flake,
      ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_24
            nix-ld
            zsh
            nodePackages.pnpm
            nodePackages.typescript
            esbuild # build
            prettier # format js/ts
            biome # format json
            opencode-flake.packages.${pkgs.system}.default
          ];

          shell = "${pkgs.zsh}/bin/zsh";

          shellHook = ''
            echo "Setting up environment for Summarizer Chrome Extension"
            echo "Node.js: $(node --version)"
            echo "npm: $(npm --version)"
            echo "esbuild: $(esbuild --version)"
            # Ensure npm dependencies are installed
            if [ ! -d node_modules ]; then
              echo "Installing npm dependencies..."
              ${pkgs.nodePackages.npm}/bin/npm install || { echo "Error: npm install failed"; exit 1; }
            fi
            # Add node_modules/.bin to PATH
            export PATH=$PWD/node_modules/.bin:$PATH
            # Set zsh as the shell
            export SHELL=${pkgs.zsh}/bin/zsh

            echo "Environment ready."
            opencode .
            exit
          '';
        };
      }
    );
}
