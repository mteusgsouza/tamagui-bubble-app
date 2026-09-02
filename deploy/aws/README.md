# zero-cache na AWS

O que roda aqui: **só o zero-cache**, com Caddy na frente para TLS.

O app server continua no Fly (`deploy/fly-app.toml`) — ele é sem estado, dorme quando
ocioso e já está funcionando. O zero-cache é que não cabe em plano gratuito nenhum,
porque mantém um slot de replicação aberto no Postgres e um replica em disco: qualquer
serviço que desliga por inatividade o quebra.

## Máquina

Serve qualquer instância pequena com Docker. **Lightsail** é a de menos peça móvel
(disco incluído, IP fixo, sem security group para configurar). Em EC2, uma `t3.micro`
dá conta.

Requisitos:

- Docker e o plugin `compose`
- portas **80 e 443** abertas para a internet (o 80 é obrigatório: a Let's Encrypt valida
  por ele antes de emitir o certificado)
- **IP estático** — em EC2 é um Elastic IP; sem isso o IP muda a cada reinício e o DNS
  aponta para o vazio
- 🔴 **Numa máquina IPv6-only**, três coisas mudam e nenhuma é o padrão: o registro DNS é
  `AAAA`, o Docker precisa do `daemon.json` desta pasta, e as portas do compose são
  publicadas em `[::]`. As duas últimas já estão nos arquivos. Vale saber o que se perde:
  quem estiver numa rede sem IPv6 não alcança o zero-cache — o app abre e autentica (o
  app server está no Fly, que tem os dois) mas **não sincroniza**.

## Passos

**1. Crie os dois bancos auxiliares no Neon.** O zero-cache guarda o estado de sync
fora do banco da aplicação, e **não cria os bancos sozinho** — ele só cria os schemas
dentro deles. Sem isso o boot falha com erro de conexão:

```sql
CREATE DATABASE zero_cvr; CREATE DATABASE zero_cdb;
```

Rode no SQL Editor do Neon, no mesmo projeto/branch do `neondb`.

**2. DNS.** Aponte um subdomínio para o IP da máquina, antes de subir — o Caddy tenta
emitir o certificado no primeiro boot e falha se o nome não resolver:

```
AAAA  zero.mateusgsouza.com.br → <IPv6 da máquina>
```

(Numa máquina dual-stack é um `A` com o IPv4; numa IPv6-only, `AAAA`. A Let's Encrypt
valida por IPv6 sem problema.) O Caddy fica **tentando em loop** enquanto o nome não
resolver, e isso não impede o zero-cache de subir — dá para deixar o DNS para depois.

Se o domínio estiver na Cloudflare, deixe a nuvem **cinza** (DNS only). Com a laranja, a
Cloudflare responde pelo certificado e o desafio do Caddy não completa.

**3. Docker.** A imagem "OS Only" da Lightsail não traz Docker:

```bash
curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker $USER && exit
```

Reconecte depois do `exit` — o grupo `docker` só passa a valer em sessão nova.

🔴 **Se a máquina for IPv6-only**, o Docker precisa do `daemon.json` desta pasta antes de
qualquer container. A bridge padrão é IPv4-only: o container sai por NAT para um IPv4 que
ali não existe, e fica sem internet — o zero-cache não alcança o Neon e o Caddy não
alcança a Let's Encrypt. (O `docker pull` funciona mesmo assim: ele roda no host.)

```bash
sudo cp daemon.json /etc/docker/daemon.json && sudo systemctl restart docker
```

⚠️ O `daemon.json` **não basta sozinho**: ele cobre a bridge padrão, e o Compose cria uma
rede própria. Por isso o `docker-compose.yml` declara `enable_ipv6` no bloco `networks`.
Rede já criada não muda de configuração — se subiu antes, `docker compose down` primeiro.

**4. Copie esta pasta para a máquina** e preencha o ambiente:

```bash
cp .env.example .env && nano .env
```

🔴 As três URLs do Neon precisam ser a conexão **direta**, sem `-pooler`. Replicação
lógica não passa por PgBouncer.

**5. Suba:**

```bash
docker compose up -d
```

**6. Acompanhe o primeiro boot.** Ele monta o replica a partir do Postgres, o que demora
proporcionalmente ao tamanho do banco:

```bash
docker compose logs -f zero
```

**7. Confirme de fora:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://zero.mateusgsouza.com.br/
```

## Depois: apontar o app para cá

O endereço do zero-cache é **embutido no build** do app (`VITE_ZERO_HOSTNAME`), não lido
em runtime. Então trocar de host exige reconstruir e reimplantar o app server:

```bash
VITE_ZERO_HOSTNAME=zero.mateusgsouza.com.br VITE_WEB_HOSTNAME=bubble.mateusgsouza.com.br ONE_SERVER_URL=https://bubble.mateusgsouza.com.br bun run build
```

```bash
fly deploy -c deploy/fly-app.toml -a bubble-app
```

E o app do zero no Fly pode ser destruído:

```bash
fly apps destroy bubble-zero
```

## Manutenção

O que você assume ao sair do Fly:

- **atualizar a imagem**: `docker compose pull && docker compose up -d` — e a versão tem
  que continuar casando com `@rocicorp/zero` do `package.json`
- **reiniciar depois de queda**: o `restart: unless-stopped` cobre reboot da máquina,
  desde que o Docker suba no boot (`systemctl enable docker`)
- **backup**: o volume `zero_data` é descartável — é um replica derivado do Postgres. Se
  perder, o zero-cache reconstrói. O que não pode perder é o Neon.

## Se um dia quiser trazer o app server também

Ele roda pelo `Dockerfile` da raiz, mas exige um `dist/` já construído — o build precisa
das variáveis `VITE_*` de produção, então não dá para construir na máquina sem passá-las.
O caminho é construir onde você desenvolve e publicar a imagem num registry (ECR ou
Docker Hub), acrescentando um serviço `app` a este compose e uma entrada no `Caddyfile`.
Enquanto o Fly der conta, não vale o trabalho.
