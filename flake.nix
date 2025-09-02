{
  description = "Run Africa Worker Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
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
            wrangler
            nix-ld
            zsh
            nodePackages.pnpm
            nodePackages.typescript
          ];

          shell = "${pkgs.zsh}/bin/zsh";

          shellHook = ''
            export NIX_LD_LIBRARY_PATH="${
              pkgs.lib.makeLibraryPath [
                pkgs.stdenv.cc.cc.lib
                pkgs.zlib
                pkgs.openssl
                pkgs.libgcc.lib
              ]
            }:$NIX_LD_LIBRARY_PATH"
            export NIX_LD="${pkgs.stdenv.cc.cc.lib}/lib/ld-linux-x86-64.so.2"
            echo "Node.js development environment loaded"
            echo "Node.js version: $(node --version)"
            echo "pnpm version: $(pnpm --version)"
            echo "TypeScript version: $(tsc --version)"
          '';
        };
      }
    );
}
