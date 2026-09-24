# Bubble App na AWS

Tudo numa máquina só: **banco**, site, API e Caddy na frente cuidando do TLS.

Fora daqui fica só o **Cloudflare R2** (mídia). O Neon saiu em 23/09/2026 — a explicação
está no `STATE.md`, mas em uma linha: o zero-cache mantinha um slot de replicação
permanente que impedia o autosuspend, e a cota do free tier morria todo mês por volta do
dia 8. Sem motor de sync o slot não existe, e com o Postgres aqui dentro não há cota.

O Fly também saiu: o trial dura 7 dias e não deixa cadastrar domínio próprio — e sem
domínio não existe login com Google.

| container | o que é | exposto? |
|---|---|---|
| `caddy` | TLS e roteamento | sim, 80 e 443 |
| `app` | site + `app/api/*` (auth, mídia, billing, cron, conteúdo) | não, só pelo Caddy |
| `db` | Postgres 17 | **não**, nem para a internet nem para o host |
| `migrate` | roda as migrations e sai | — |


## Backup — leia antes de qualquer coisa

🔴 **O banco agora mora nesta máquina.** Com o Neon fora, ninguém mais faz backup por
você: a máquina morrer passa a significar perder o produto, e um `docker compose down -v`
distraído apaga o volume `pgdata`.

O mínimo:

```bash
# na máquina, diariamente por cron
docker compose exec -T db pg_dump -U bubble -Fc bubble > ~/backups/bubble-$(date +%F).dump
```

E **mandar o dump para fora do disco** — as credenciais do R2 já estão no `app.env`.
Backup no mesmo disco que ele protege não é backup.

⚠️ **Teste a restauração uma vez**, num banco descartável. Backup não testado é ficção.

Snapshot semanal da Lightsail é um clique no console e cobre o disco inteiro.

## Sequência de deploy

A ordem importa, e o script não a impõe sozinho:

1. `bun run build` com as `VITE_*` (elas são **embutidas no build**, não lidas em runtime)
2. `docker build` + publicar a imagem
3. `docker compose up -d --remove-orphans` — o serviço `migrate` roda antes do `app`
   subir, por `depends_on: db healthy`
4. conferir `GET /api/health` e o feed

ℹ️ **Sem acesso ao registry?** Dá para pular o Docker Hub inteiro:

```bash
docker save mteusgsouza/bubble-app:latest | gzip -1   | ssh -i ~/.ssh/lightsail-bubble.pem ubuntu@bubble.mateusgsouza.com.br 'gunzip | docker load'
```

Leva alguns minutos para ~470 MB, e o `Id` da imagem dos dois lados tem que bater.

## Banco novo, do zero

`VITE_MASTER_USER_ID` é embutido no build e é o `feedOwnerId` de todo conteúdo. Num banco
recém-criado esse id não existe, e `seed-posts.ts` aborta. Um cadastro normal gera id
aleatório, e trocá-lo depois esbarra nas FKs.

```bash
docker compose exec -T app sh -c 'cd /app && bun scripts/bootstrap-creator.ts   --email criador@exemplo.com --password SENHA   --id <VITE_MASTER_USER_ID> --url http://localhost:8092'

docker compose exec -T -e VITE_MASTER_USER_ID=<id> app sh -c   'cd /app && bun scripts/seed-courses.ts && bun scripts/seed-posts.ts'
```

## Máquina

Lightsail com Docker, plano de **1 GB** ou mais. Requisitos:

- portas **80 e 443** abertas (o 80 é obrigatório: a Let's Encrypt valida por ele)
- **IP estático**, senão o endereço muda no reboot e o DNS aponta para o vazio
- **dual-stack**, não IPv6-only. Em *Instances → sua instância → aba Networking*. Numa
  máquina só-IPv6, quem abrir o site de uma rede sem IPv6 não vê nada — que num
  portfólio é justamente o caso que mais importa.

Com 1 GB cabe com folga — medido em 24/09/2026: `app` 123 MB + `db` 37 MB + `caddy`
21 MB, com **321 MB disponíveis**. Olhe a coluna `available` do `free -h`, não a `free`.
Ligue swap antes de subir mesmo assim:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
```

```bash
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## Antes: o que não é na máquina

**1. Cloudflare R2.** Bucket criado e o CORS liberando `https://bubble.mateusgsouza.com.br`
— o navegador faz PUT direto no R2, sem passar por este servidor.

**2. DNS.** Um registro só, apontando para a máquina:

```
A     bubble.mateusgsouza.com.br  → <IPv4 da máquina>
AAAA  bubble.mateusgsouza.com.br  → <IPv6 da máquina>
```

ℹ️ Havia um segundo nome, `zero.`, para o zero-cache. Pode ser apagado.

**3. Google Cloud Console.** A URI de redirecionamento autorizada tem que ser exatamente
`https://bubble.mateusgsouza.com.br/api/auth/callback/google`.

## A imagem do app

O `Dockerfile` roda `bun install`, que não cabe na RAM da instância. Então a imagem é
construída **na sua máquina** e puxada de um registry.

🔴 **Docker Hub, não ghcr.io.** O ghcr.io não publica registro `AAAA` — numa máquina
IPv6-only o pull morre com `i/o timeout` num endereço IPv4 e não existe configuração que
resolva. O Docker Hub tem IPv6 no registry, no auth e no CDN.

⚠️ As variáveis `VITE_*` são **embutidas no build**, não lidas em runtime. Trocar
qualquer uma delas depois exige reconstruir e republicar — mexer no `app.env` não adianta.

Na raiz do repo, na sua máquina:

```bash
VITE_WEB_HOSTNAME=bubble.mateusgsouza.com.br \n  VITE_MASTER_USER_ID=<id do criador> \n  ONE_SERVER_URL=https://bubble.mateusgsouza.com.br bun run build
```

```bash
docker login
```

```bash
docker build -t SEU_USUARIO/bubble-app:latest . && docker push SEU_USUARIO/bubble-app:latest
```

Confira em *hub.docker.com → Repositories → bubble-app → Settings* que o repositório
ficou **público**; privado, a instância também precisa de `docker login`.

## Na máquina

**1. Docker** — a imagem "OS Only" da Lightsail não traz:

```bash
curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker $USER && exit
```

Reconecte depois do `exit`: o grupo `docker` só passa a valer em sessão nova.

**2. Os arquivos.** Copie `docker-compose.yml` e `Caddyfile` desta pasta para
`~/bubble-app/`, troque `SEU_USUARIO` no compose pelo seu usuário do Docker Hub, e crie
os envs:

```bash
cp app.env.example app.env && nano app.env
```

🔴 **`POSTGRES_PASSWORD` vai num `.env` ao lado do compose**, não no `app.env`: o
`env_file` só define variáveis **dentro** do container, e o compose precisa do valor para
interpolar `${POSTGRES_PASSWORD}` no serviço `db`. O mesmo valor entra dentro da
`DATABASE_URL`, no `app.env`.

```bash
PW=$(openssl rand -hex 24)
printf 'POSTGRES_PASSWORD=%s
' "$PW" > .env
chmod 600 .env app.env
```

**3. Suba:**

```bash
docker compose up -d --remove-orphans && docker compose logs -f app
```

O `migrate` roda antes do `app` subir (`depends_on: db healthy`) e sai sozinho.

**4. Confirme de fora:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://bubble.mateusgsouza.com.br/
```

## O criador

`VITE_MASTER_USER_ID` é **embutido no build** e é o `feedOwnerId` de todo conteúdo. Com
ele vazio o feed abre vazio — comportamento correto, não bug.

Duas ordens possíveis, e a segunda evita um build:

- **o criador entra primeiro**: pegue o id no banco, refaça o build com a variável e
  republique
- **o id já está escolhido**: use `scripts/bootstrap-creator.ts` para criar a conta já
  com ele (ver *Banco novo, do zero* acima)

## Manutenção

- **atualizar o app**: `bash scripts/deploy.sh` do Git Bash faz os quatro passos —
  build pela WSL (o bun não roda no Windows), imagem, troca do container por SSH e
  confere o 200. Precisa da chave da Lightsail em `~/.ssh/lightsail-bubble.pem`; sem
  ela o script imprime o comando para colar no terminal do navegador.
- 🔴 **backup**: o volume `pgdata` **é** o produto. Ver a primeira seção deste arquivo.
- **query lenta**: o `db` loga qualquer coisa acima de 200 ms
  (`log_min_duration_statement`). Depois de um passe pelo app, `docker compose logs db`
  deve estar vazio — linha ali é regressão com nome e sobrenome.
- **reboot**: o `restart: unless-stopped` cobre, desde que o Docker suba no boot
  (`sudo systemctl enable docker`)

## Se a máquina for IPv6-only

Não é o recomendado (ver *Máquina*), mas se for, duas coisas que o padrão do Docker não
faz — e que já estão nos arquivos desta pasta:

- **`daemon.json`**: a bridge padrão é IPv4-only. O container sai por NAT para um IPv4
  que ali não existe e fica sem internet — o Caddy não
  alcança a Let's Encrypt. (O `docker pull` funciona: roda no host.)

  ```bash
  sudo cp daemon.json /etc/docker/daemon.json && sudo systemctl restart docker
  ```

- **`enable_ipv6` no bloco `networks`** do compose: o `daemon.json` cobre só a bridge
  padrão, e o Compose cria uma rede própria. Rede já criada não muda de configuração —
  se subiu antes, `docker compose down` primeiro.

O sintoma de faltar qualquer um dos dois é `ENETUNREACH` ao sair para a internet, com
`ETIMEDOUT` nos IPv4 junto.
