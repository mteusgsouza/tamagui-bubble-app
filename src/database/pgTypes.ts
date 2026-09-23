// Desliga a interpretação de `timestamp` pelo driver. Importar por efeito colateral.
//
// 🔴 **O `pg` lê `timestamp without time zone` como hora LOCAL do processo.** As colunas
// deste schema guardam UTC (quem escreve usa `new Date().toISOString()`), então numa
// máquina fora do UTC — a WSL daqui é America/Sao_Paulo — o driver produz um `Date`
// deslocado, e o Drizzle em `mode: 'string'` reserializa esse `Date` deslocado com
// `toISOString()`. O resultado é conteúdo "publicado há 3 horas" no instante em que
// nasce, sem erro nenhum aparecendo.
//
// Em produção o container roda em UTC e o defeito some por acaso — que é a pior forma
// de um bug existir.
//
// Devolvendo a string crua, ninguém interpreta fuso no meio do caminho: o valor chega
// como o Postgres o escreveu e vira epoch numa função só, `toEpoch`, que assume UTC —
// a mesma suposição que o próprio Drizzle faz em `mode: 'date'` (`value + "+0000"`,
// drizzle-orm/pg-core/columns/timestamp.js:31).
import { types } from 'pg'

/** OIDs de `timestamp` e `timestamptz`. */
const TIMESTAMP = 1114
const TIMESTAMPTZ = 1184

types.setTypeParser(TIMESTAMP, (value) => value)
types.setTypeParser(TIMESTAMPTZ, (value) => value)
