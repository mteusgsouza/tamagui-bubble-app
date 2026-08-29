# Fase 6 — Feed

## Objetivo

Fechar o feed: detalhe do post, carrossel de mídia, curtidas, comentários com resposta e
paginação — consumindo as queries da Fase 4 e o `<MediaView>` da Fase 5.

## Feito

### O que já existia (feito fora do fluxo de agentes, antes desta fase)

`src/tamagui/brandAccent.ts` (rampa de acento), a tela de lista
`app/(app)/home/(tabs)/feed/index.tsx` e uma primeira versão de
`src/features/feed/PostCard.tsx`. Esta fase reescreveu o card e a tela de lista;
a rampa de acento ficou como estava.

### Criado

| Arquivo | O que é |
|---|---|
| [`app/(app)/home/(tabs)/feed/[postId].tsx`](../../../app/(app)/home/(tabs)/feed/%5BpostId%5D.tsx) | rota de detalhe do post |
| [`src/features/feed/PostDetail.tsx`](../../../src/features/feed/PostDetail.tsx) | o post inteiro, sem corte, com a thread |
| [`src/features/feed/PostMediaCarousel.tsx`](../../../src/features/feed/PostMediaCarousel.tsx) | carrossel com o indicador "1/3" do mock |
| [`src/features/feed/CommentList.tsx`](../../../src/features/feed/CommentList.tsx) | lista, composer, resposta e apagar |
| [`src/features/feed/LikeButton.tsx`](../../../src/features/feed/LikeButton.tsx) | curtir via `reaction.toggle` |
| [`src/features/feed/CreatorBadge.tsx`](../../../src/features/feed/CreatorBadge.tsx) | selo "Criador", usado em três telas |
| [`src/features/feed/formatDate.ts`](../../../src/features/feed/formatDate.ts) | `timeAgo`, `fullDate`, `visibilityLabel`, `plural` |
| [`src/features/feed/types.ts`](../../../src/features/feed/types.ts) | formas que a UI consome + `postMediaItems()` |
| [`src/interface/forms/TextArea.tsx`](../../../src/interface/forms/TextArea.tsx) | faltava um multilinha no `interface/` |
| `src/interface/icons/phosphor/` | `HeartIcon`, `HeartFillIcon`, `ChatCircleIcon` |
| [`src/test/unit/feed-format.test.ts`](../../../src/test/unit/feed-format.test.ts) | datas, plural, `postMediaItems` |
| [`src/test/unit/media-constants.test.ts`](../../../src/test/unit/media-constants.test.ts) | allowlist de mime e limites da Fase 5 |
| [`src/test/integration/feed.test.ts`](../../../src/test/integration/feed.test.ts) | login → feed → detalhe (Playwright) |

### Editado

- [`src/features/feed/PostCard.tsx`](../../../src/features/feed/PostCard.tsx) — carrossel,
  `LikeButton`, corte do corpo com "ver mais", link para o detalhe.
- [`app/(app)/home/(tabs)/feed/index.tsx`](../../../app/(app)/home/(tabs)/feed/index.tsx)
  — paginação.
- [`app/routes.d.ts`](../../../app/routes.d.ts) — entradas de `/home/feed/[postId]`,
  escritas à mão no formato do gerador (ver Decisões).

## Decisões

**1. Paginação por limite crescente, não pelo cursor de `feedPostsPage`.**
Uma query reativa só, uma lista só. Com cursor seriam N assinaturas para costurar à mão,
e um post apagado no meio deixaria buraco ou chave duplicada. O Zero sincroniza o
incremento, não a janela inteira. `feedPostsPage` continua exportada e sem uso — vale
quando o feed crescer a ponto de a janela pesar. **Fica registrado como dívida
consciente.**

**2. O link para o detalhe cobre só o texto, não a mídia.**
Card inteiro clicável é o padrão de feed, mas aqui o primeiro toque num vídeo tem que ser
"tocar", não "navegar". Então o `<Link>` embrulha título e corpo; a mídia e o botão de
curtir ficam fora. O contador de comentários também leva ao detalhe.

**3. Corte do corpo por caractere (240), não por `numberOfLines`.**
`numberOfLines` mede diferente na web e no nativo, e o card ficaria com altura diferente
em cada plataforma. Corte por caractere é determinístico nos dois lados.

**4. Thread de um nível só.** `comment.parentId` aponta sempre para o comentário
**raiz**: responder a uma resposta pendura no mesmo raiz, e o composer mostra o nome de
quem se está respondendo. É o que o schema comporta — `parentId` não tem profundidade —
e evita a árvore infinita que ninguém consegue ler no celular.

**5. `newId()` e `Date.now()` só na tela.** Vale para `reaction.toggle` e
`comment.insert`. As mutations rodam duas vezes (otimista no cliente, autoritativa no
servidor) e precisam convergir: id ou timestamp nascendo dentro delas divergiria.

**6. Editei `app/routes.d.ts` à mão.** É arquivo gerado — o One reescreve na subida do
dev server (`typedRoutesGeneration: 'runtime'`). Mas sem as entradas de
`/home/feed/[postId]` o `Href` tipado recusa o link e o typecheck quebra, e eu não rodo
`bun dev`. Escrevi seguindo o formato das rotas existentes (4 variantes de grupo, como
as estáticas do feed). **Se o dev server regenerar diferente, o dele vence.**

**7. Comentário tem "Apagar", que não estava no mock.** `comment.softDelete` existe desde
a Fase 4 e um sistema de comentários onde não dá para apagar o próprio comentário está
incompleto. Só aparece no que é seu.

**8. Idioma: português literal, sem i18n.** Não é uma decisão nova — é o que a tela de
feed e o `PostCard` já faziam, e o `<MediaView>` da Fase 5 também. Segui o que existia
para não deixar a base meio a meio. **A decisão de verdade continua aberta**, ver
"Pendências".

## Comandos pro usuário rodar

⚠️ **Antes de tudo:** o seed tem `commentCount` mentindo. `p-landing` diz 3 comentários,
`p-funil` 2, `p-anuncio` 1 — e a tabela `comment` está **vazia**. A tela vai mostrar
"3 comentários" e logo abaixo "Ninguém comentou ainda". Não é bug do código, é o contador
denormalizado dessincronizado do seed. Zere antes de testar, senão o primeiro comentário
que você escrever vira "4":

```bash
docker compose exec pgdb psql -U user -d postgres -c 'UPDATE post SET "commentCount" = 0'
```

```bash
bun check types
```
→ limpo. Rodei o `tsc` do repo aqui: **zero erros**.

```bash
bun dev
```
→ **reinicie**: `[postId].tsx` é rota nova e o scanner do One não pega arquivo criado com
o servidor no ar (file watching não funciona em `/mnt/f`). Ao subir, ele regenera
`app/routes.d.ts` — se o diff dele for diferente do meu, use o dele e rode
`bun check types` de novo.

```bash
bun test:unit
```
→ 2 arquivos novos (`feed-format`, `media-constants`), tudo função pura. **Não consegui
rodar**: os binários nativos (`rolldown`) instalados são de Linux e eu estou no Windows.

```bash
bun test:integration
```
→ `feed.test.ts` faz login → feed → detalhe. Os dois primeiros testes **pulam** (não
falham) se o banco não tiver post publicado — feed vazio é comportamento correto.

### Na tela

1. `http://localhost:8081/home/feed` — os 5 posts do seed, a foto do `p-funil` no
   carrossel, contadores de curtida.
2. **Curtir** um post: o coração enche e o número sobe na hora (otimista). Recarregue —
   tem que continuar curtido.
3. **Abrir** um post pelo título → `/home/feed/<id>`, com data completa e a caixa de
   comentário.
4. **Comentar**, depois **Responder** ao próprio comentário: a resposta entra recuada, e
   `commentCount` sobe junto no card do feed quando você voltar.
5. **Apagar** o próprio comentário: some da lista e o contador desce.
6. `http://localhost:8081/home/feed/nao-existe` → "Post indisponível".

Para ver o carrossel de verdade, prenda uma segunda mídia ao mesmo post (`position` 1) —
com uma só ele nem monta ScrollView.

⚠️ Use `localhost:8081`, não o IP de rede (`trustedOrigins` derruba o login).

## Não feito

- **Nenhuma tela nova de aba.** O mock mostra Feed/Cursos/Assinatura/Perfil no tab bar;
  Cursos é Fase 7 e Assinatura é Fase 9. `NavigationTabs` continua com home + perfil.
- **Curtida em comentário.** O mock mostra um número ao lado de cada comentário, mas
  `reaction` só tem `postId` — não há como curtir comentário sem migration. Deixei de
  fora de propósito; se o produto quiser, é coluna nova na Fase 7 ou 8.
- **Sem "carregar mais" automático (scroll infinito).** Botão explícito. Scroll infinito
  em `ScrollView` sem virtualização piora mais do que ajuda.
- **Sem virtualização da lista.** `ScrollView` com `.map()`. Com paginação de 20 está
  bem; acima de ~200 posts na tela vale `FlashList`.
- **Composer de post não existe.** Publicar é Fase 8 (Admin). Hoje só dá para criar post
  por SQL.
- **Teste unitário de query/mutation do Zero.** O plano pedia; testar mutation do Zero de
  verdade exige um harness de transação que não existe no repo. Testei o que é função
  pura. Fica como dívida.
- **Nada validado em runtime por mim** — não rodo `bun dev`.

## Contrato pro próximo

### Componentes reaproveitáveis (a Fase 7 vai querer os três)

```tsx
import { PostMediaCarousel } from '~/features/feed/PostMediaCarousel'
import { CreatorBadge } from '~/features/feed/CreatorBadge'
import { timeAgo, fullDate, plural } from '~/features/feed/formatDate'
```

`PostMediaCarousel` recebe `readonly MediaViewMedia[]` — serve para a capa de curso e
para a mídia da aula sem mudança.

### Tipos

`~/features/feed/types` tem `FeedPost`, `FeedComment`, `FeedAuthor`, `FeedPostMedia` e
`postMediaItems()`. São estruturais de propósito, para o mesmo componente aceitar o
resultado de `feedPosts` e de `postDetail`, que trazem campos diferentes.

### O padrão da tela

```tsx
const { user } = useAuth()            // useAuth, nunca useUser (waterfall)
const [rows, status] = useQuery(query, params, { enabled: Boolean(user?.id) })
const isLoading = status?.type !== 'complete' && rows.length === 0
```

`useQuery` devolve `[dados, status]`; `status.type === 'complete'` é o que distingue
"vazio de verdade" de "ainda sincronizando". As duas telas do feed fazem assim.

### Rota nova exige regenerar os tipos

Criou rota? Reinicie o `bun dev` para o One reescrever `app/routes.d.ts`, senão o `Href`
tipado recusa o link.

## Pendências abertas

1. **Idioma da UI.** Todo texto novo (feed, mídia, comentários) é português literal; a
   parte herdada do Takeout (auth, settings) continua em inglês. **A base está meio a
   meio e ninguém decidiu.** Se for i18n, o custo cresce a cada fase — decidir antes da
   Fase 7 é mais barato que depois.
2. **Contadores denormalizados podem dessincronizar.** `likeCount` e `commentCount` são
   mantidos pelas mutations, mas qualquer escrita por SQL (como o seed) fura isso. Se
   virar problema recorrente, um job de reconciliação resolve — ou uma trigger.
3. **`feedPostsPage` está exportada e sem uso** (ver Decisão 1).
