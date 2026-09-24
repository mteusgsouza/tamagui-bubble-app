#!/usr/bin/env bash
#
# Backup do Postgres de produção. Roda NA MÁQUINA, por cron.
#
#   bash ~/bubble-app/backup.sh
#
# 🔴 **Por que isto existe.** O banco saiu do Neon e passou a morar no volume `pgdata`
# desta máquina. Não há mais backup gerenciado: a máquina morrer, ou um
# `docker compose down -v` distraído, significa perder o produto inteiro.
#
# O dump vai para `~/backups` e **sobe para o R2**. Backup no mesmo disco que ele
# protege não é backup — é uma cópia que morre junto.

set -euo pipefail

PASTA=~/bubble-app
DESTINO=~/backups
RETENCAO_DIAS=7

# Prefixo no bucket. Separe de `media/`: o bucket de mídia é servido por URL assinada, e
# misturar dump de banco com arquivo de conteúdo é convite a expor um pelo outro.
PREFIXO=backups/postgres

cd "$PASTA"

mkdir -p "$DESTINO"
ARQUIVO="$DESTINO/bubble-$(date +%F-%H%M).dump"

# -Fc: formato custom, que o pg_restore lê seletivamente e comprime sozinho
echo "==> dump"
docker compose exec -T db pg_dump -U bubble -Fc bubble > "$ARQUIVO"

# dump vazio é pior que dump nenhum: ele passa despercebido até a hora de restaurar
TAMANHO=$(stat -c %s "$ARQUIVO")
if [ "$TAMANHO" -lt 10000 ]; then
  echo "❌ dump com $TAMANHO bytes — pequeno demais para ser verdade. Abortando." >&2
  rm -f "$ARQUIVO"
  exit 1
fi
echo "    $ARQUIVO ($((TAMANHO / 1024)) KB)"

# --------------------------------------------------------------------------
# Envio para o R2
# --------------------------------------------------------------------------
# As credenciais saem do `app.env`, que já as tem para a mídia. Nada é digitado aqui.
if command -v rclone >/dev/null; then
  set -a
  # shellcheck disable=SC1091
  . "$PASTA/app.env"
  set +a

  if [ -n "${CLOUDFLARE_R2_ACCESS_KEY:-}" ]; then
    echo "==> enviando para o R2"

    # sem arquivo de config: tudo vem por env. O `--config ""` calaria o NOTICE de
    # "config file not found", que num log lido por humano é só ruído.
    export RCLONE_CONFIG=""
    export RCLONE_CONFIG_R2_TYPE=s3
    export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
    export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$CLOUDFLARE_R2_ACCESS_KEY"
    export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$CLOUDFLARE_R2_SECRET_KEY"
    export RCLONE_CONFIG_R2_ENDPOINT="$CLOUDFLARE_R2_ENDPOINT"

    # ⚠️ `--s3-no-head` não é otimização: **o R2 devolve 501 Not Implemented** no HEAD
    # que o rclone faz depois de subir, e sem este flag toda execução deixa um `ERROR`
    # no log e só acerta no retry. Log que sempre tem erro é log que ninguém lê.
    #
    # 🔴 Mas o HEAD era a conferência de integridade, então ela é refeita logo abaixo
    # com um `rclone ls` — que o R2 implementa — comparando o tamanho. Trocar uma
    # verificação por nenhuma seria pior que o erro no log.
    rclone copy "$ARQUIVO" "r2:$CLOUDFLARE_R2_BUCKET/$PREFIXO/" \
      --s3-no-check-bucket \
      --s3-no-head

    NOME=$(basename "$ARQUIVO")
    REMOTO=$(rclone ls "r2:$CLOUDFLARE_R2_BUCKET/$PREFIXO/$NOME" --s3-no-check-bucket 2>/dev/null | awk '{print $1}')

    if [ "$REMOTO" != "$TAMANHO" ]; then
      echo "❌ o que chegou ao R2 tem $REMOTO bytes, o dump tem $TAMANHO. Não confie neste backup." >&2
      exit 1
    fi
    echo "    enviado e conferido ($REMOTO bytes)"
  else
    echo "⚠️  R2 sem credencial no app.env — o dump ficou só no disco local." >&2
  fi
else
  echo "⚠️  rclone não instalado — o dump ficou só no disco local." >&2
  echo "    curl https://rclone.org/install.sh | sudo bash" >&2
fi

# --------------------------------------------------------------------------
# Retenção local
# --------------------------------------------------------------------------
# Só o disco local é podado. O que está no R2 fica — lá o custo é irrelevante, e é
# justamente a cópia que sobrevive à máquina.
echo "==> podando locais com mais de $RETENCAO_DIAS dias"
find "$DESTINO" -name 'bubble-*.dump' -mtime +$RETENCAO_DIAS -delete

echo "✅ pronto · $(ls -1 "$DESTINO" | wc -l) dump(s) no disco"
