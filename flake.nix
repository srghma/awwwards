{
  description = "Awwwards.com functional style stealth scraper environment";

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
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };

        pg-start = pkgs.writeShellScriptBin "pg_start" ''
          if pg_ctl -D "$PGDATA" status > /dev/null 2>&1; then
            echo "⚠️  Postgres is already running (PID: $(cat $PGDATA/postmaster.pid))"
            exit 1
          fi

          echo "🚀 Starting PostgreSQL..."
          # Using -o to ensure socket is created in project dir regardless of config
          pg_ctl -D "$PGDATA" -l "$PGDATA/postgres.log" -o "-k $PGDATA" start

          for i in {1..10}; do
            if pg_isready -h 127.0.0.1 -p "$PGPORT" >/dev/null 2>&1; then
              echo "✨ PostgreSQL is ready!"
              createdb -h 127.0.0.1 -p "$PGPORT" -U postgres awwwards 2>/dev/null || echo "🐘 DB exists."
              exit 0
            fi
            echo "⏳ Waiting... ($i/10)"
            sleep 1
          done
          echo "❌ Failed to start. Check $PGDATA/postgres.log"
          exit 1
        '';

        pg-stop = pkgs.writeShellScriptBin "pg_stop" ''
          echo "🛑 Stopping PostgreSQL..."
          pg_ctl -D "$PGDATA" stop
        '';

        pg-status = pkgs.writeShellScriptBin "pg_status" ''
          pg_ctl -D "$PGDATA" status
        '';

        pg-logs = pkgs.writeShellScriptBin "pg_logs" ''
          tail -f "$PGDATA/postgres.log"
        '';
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            postgresql
            pg-start
            pg-stop
            pg-status
            pg-logs
          ];

          shellHook = ''
            export PGDATA="$PWD/.pg"
            export PGPORT=5432
            # Explicitly tell postgres clients to look for the socket in our .pg dir
            export PGHOST="$PGDATA"
            export DATABASE_URL="postgresql://postgres@127.0.0.1:5432/awwwards"
            export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
            export PUPPETEER_EXECUTABLE_PATH="google-chrome-stable"

            if [ ! -d "$PGDATA" ]; then
              echo "📦 Initializing PostgreSQL directory at $PGDATA..."
              initdb -D "$PGDATA" --no-locale --auth=trust
              echo "host all all 127.0.0.1/32 trust" >> "$PGDATA/pg_hba.conf"
              # Configure postgres to put the Unix socket in the project dir
              echo "unix_socket_directories = '$PGDATA'" >> "$PGDATA/postgresql.conf"
              echo "listen_addresses = '127.0.0.1'" >> "$PGDATA/postgresql.conf"
              echo "✅ Initialization complete."
            fi

            # Fix existing configs that might be missing the socket path
            if ! grep -q "unix_socket_directories" "$PGDATA/postgresql.conf"; then
               echo "unix_socket_directories = '$PGDATA'" >> "$PGDATA/postgresql.conf"
            fi

            echo ""
            echo "🕵️  Awwwards Scraper Dev Environment"
            echo "===================================="
            if pg_isready -h 127.0.0.1 -p "$PGPORT" >/dev/null 2>&1; then
               echo "🐘 Postgres: 🟢 RUNNING"
            else
               echo "🐘 Postgres: 🔴 STOPPED (type 'pg_start')"
            fi
            echo "📜 Commands: pg_start, pg_stop, pg_status, pg_logs"
            echo "🌐 DB URL:  $DATABASE_URL"
            echo "===================================="
            echo ""
          '';
        };
      }
    );
}
