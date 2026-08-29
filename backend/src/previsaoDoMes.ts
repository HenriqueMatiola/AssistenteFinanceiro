/**
 * Busca no banco as recorrências que ainda não viraram lançamento num mês.
 *
 * A REGRA de quem é pendente mora em `previsao.ts`, que não conhece banco e
 * por isso tem teste de unidade. Aqui fica só a ida ao Postgres — separado
 * para o Dashboard e a tela de Lançamentos usarem exatamente o mesmo critério,
 * em vez de cada um reimplementar o seu.
 */
import { prisma } from './prisma.ts';
import { mesAceitaPrevisao, recorrenciasPendentes } from './previsao.ts';
import { dataPrevista } from './projecao.ts';
import { mesAtualUTC, type IntervaloDeMes } from './validacao.ts';
import type { ClassificacaoGasto, TipoTransacao } from './generated/prisma/enums.ts';

/** Uma recorrência que ainda não virou lançamento no mês consultado. */
export interface RecorrenciaPrevista {
  id: number;
  descricao: string;
  categoria: string;
  tipo: TipoTransacao;
  formaDePagamento: string | null;
  classificacao: ClassificacaoGasto | null;
  diaDoMes: number;
  valor: number;
  /** Em que dia ela cai neste mês, "AAAA-MM-DD" — já encolhido em mês curto. */
  data: string;
}

/**
 * As recorrências ativas do usuário que ainda não viraram lançamento no mês.
 *
 * Devolve lista vazia para meses passados: previsão é sobre o que ainda vai
 * acontecer, e estimar um mês encerrado esconderia o lançamento esquecido.
 */
export async function previsaoDoMes(
  usuarioId: number,
  mes: string,
  intervalo: IntervaloDeMes
): Promise<RecorrenciaPrevista[]> {
  if (!mesAceitaPrevisao(mes, mesAtualUTC())) {
    return [];
  }

  const [ativas, jaLancadas] = await Promise.all([
    prisma.recorrencia.findMany({
      where: { usuarioId, ativa: true },
      orderBy: [{ diaDoMes: 'asc' }, { id: 'asc' }],
    }),

    // Quais recorrências já geraram lançamento dentro do mês. Só o id
    // interessa, então pedimos só ele.
    prisma.transacao.findMany({
      where: { usuarioId, data: intervalo, recorrenciaId: { not: null } },
      select: { recorrenciaId: true },
      distinct: ['recorrenciaId'],
    }),
  ]);

  const idsLancados = new Set(
    jaLancadas.map((t) => t.recorrenciaId).filter((id): id is number => id !== null)
  );

  return recorrenciasPendentes(ativas, idsLancados).map((r) => ({
    id: r.id,
    descricao: r.descricao,
    categoria: r.categoria,
    tipo: r.tipo,
    formaDePagamento: r.formaDePagamento,
    classificacao: r.classificacao,
    diaDoMes: r.diaDoMes,
    valor: r.valor.toNumber(),
    data: dataPrevista(mes, r.diaDoMes),
  }));
}
