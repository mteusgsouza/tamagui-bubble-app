# Bubble App na AWS

Tudo numa máquina só: site, API e sync, com Caddy na frente cuidando do TLS.

Fora daqui ficam **Neon** (Postgres) e **Cloudflare R2** (mídia), que têm free tier de
verdade. O Fly saiu de cena: o trial dura 7 dias e não deixa cadastrar domínio próprio —
e sem domínio não existe login com Google.

| container | o que é | exposto? |
|---|---|---|
| `caddy` | TLS e roteamento por subdomínio | sim, 80 e 443 |
| `app` | site + `app/api/*` (auth, mídia, billing, cron, zero) | não, só pelo Caddy |
| `zero` | zero-cache: o sync reativo | não, só pelo Caddy |

## Máquina

Lightsail com Docker, plano de **1 GB** ou mais. Requisitos:

- portas **80 e 443** abertas (o 80 é obrigatório: a Let's Encrypt valida por ele)
- **IP estático**, senão o endereço muda no reboot e o DNS aponta para o vazio
- **dual-stack**, não IPv6-only. Em *Instances → sua instância → aba Networking*. Numa
  máquina só-IPv6, quem abrir o site de uma rede sem IPv6 não vê nada — que num
  portfólio é justamente o caso que mais importa.

Com 1 GB, três containers cabem apertado. Uma swap resolve:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
```

```bash
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## Antes: o que não é na máquina

**1. Neon.** Crie os dois bancos auxiliares — o zero-cache cria os schemas dentro deles,
mas não cria os bancos:

```sql
CREATE DATABASE zero_cvr; CREATE DATABASE zero_cdb;
```

E **ligue a replicação lógica**, que vem desligada: *Settings → Logical Replication →
Enable*. Isso reinicia o compute. Sem ela o zero-cache morre no boot com
`Postgres must be configured with "wal_level = logical"`. Confirme (`SHOW` não funciona
no SQL Editor do Neon):

```sql
SELECT current_setting('wal_level');
```

**2. DNS.** Dois nomes, ambos para esta máquina, **antes** de subir — o Caddy tenta
emitir os certificados no primeiro boot e falha se os nomes não resolverem:

```
AAAA  bubble.mateusgsouza.com.br → <IPv6 da máquina>
AAAA  zero.mateusgsouza.com.br   → <IPv6 da máquina>
A     (os mesmos dois nomes)     → <IPv4 estático>
```

Crie no provedor que hospeda o DNS do domínio hoje (é a Vercel; o site principal continua
lá, subdomínio não interfere). Criar uma zona DNS na Lightsail **não funciona** sem
delegar `NS` do pai para ela — é caminho mais longo para o mesmo lugar.

**3. Google.** No Cloud Console, a URI de redirecionamento autorizada tem que ser
exatamente `https://bubble.mateusgsouza.com.br/api/auth/callback/google`.

**4. R2.** O CORS do bucket precisa listar `https://bubble.mateusgsouza.com.br` — o
navegador faz `PUT` direto no R2, sem passar pelo servidor. Use `scripts/r2-cors.ts`.

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
VITE_ZERO_HOSTNAME=zero.mateusgsouza.com.br VITE_WEB_HOSTNAME=bubble.mateusgsouza.com.br ONE_SERVER_URL=https://bubble.mateusgsouza.com.br bun run build
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
os dois envs:

```bash
cp zero.env.example zero.env && nano zero.env
```

```bash
cp app.env.example app.env && nano app.env
```

**3. Suba:**

```bash
docker compose up -d && docker compose logs -f zero
```

O primeiro boot do zero-cache demora: ele copia o banco do Neon para o replica local.

**4. Confirme de fora:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://bubble.mateusgsouza.com.br/
```

## Depois do primeiro login

`VITE_MASTER_USER_ID` nasce vazio, e **com ele vazio o feed abre vazio** — comportamento
correto, não bug. O id só existe depois que o criador entrar de verdade. Pegue no banco,
refaça o build com a variável, republique a imagem e:

```bash
docker compose pull app && docker compose up -d app
```

## Manutenção

- **atualizar o app**: rebuild na sua máquina → push → aqui `docker compose pull app` e
  `docker compose up -d app`
- **atualizar o zero-cache**: a versão da imagem tem que continuar casando com
  `@rocicorp/zero` do `package.json` e com `ZERO_VERSION` do `app.env`
- **backup**: o volume `zero_data` é descartável — é um replica derivado do Postgres, e
  se sumir o zero-cache reconstrói. O que não pode se perder é o Neon.
- **reboot**: o `restart: unless-stopped` cobre, desde que o Docker suba no boot
  (`sudo systemctl enable docker`)

## Se a máquina for IPv6-only

Não é o recomendado (ver *Máquina*), mas se for, duas coisas que o padrão do Docker não
faz — e que já estão nos arquivos desta pasta:

- **`daemon.json`**: a bridge padrão é IPv4-only. O container sai por NAT para um IPv4
  que ali não existe e fica sem internet — o zero-cache não alcança o Neon, o Caddy não
  alcança a Let's Encrypt. (O `docker pull` funciona: roda no host.)

  ```bash
  sudo cp daemon.json /etc/docker/daemon.json && sudo systemctl restart docker
  ```

- **`enable_ipv6` no bloco `networks`** do compose: o `daemon.json` cobre só a bridge
  padrão, e o Compose cria uma rede própria. Rede já criada não muda de configuração —
  se subiu antes, `docker compose down` primeiro.

O sintoma de faltar qualquer um dos dois é `ENETUNREACH` no endereço IPv6 do Neon, com
`ETIMEDOUT` nos IPv4 junto.
