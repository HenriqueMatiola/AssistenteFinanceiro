/**
 * O rosto da conta: a foto quando existe, as iniciais quando não.
 *
 * Vive num componente próprio porque aparece em dois lugares — pequeno na
 * barra superior e grande na tela de Perfil — e a regra de "foto ou iniciais"
 * não pode divergir entre eles.
 */

/** "Henrique Matiola" → "HM". Duas letras cabem no círculo; três já não. */
export function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? '?';
  const ultima = partes.length > 1 ? (partes.at(-1)?.[0] ?? '') : '';
  return (primeira + ultima).toUpperCase();
}

interface Props {
  nome: string;
  foto: string | null;
  /** `grande` é o tamanho da tela de Perfil; o padrão é o da barra superior. */
  tamanho?: 'barra' | 'grande';
}

function Avatar({ nome, foto, tamanho = 'barra' }: Props) {
  const classes = `avatar${tamanho === 'grande' ? ' avatar--grande' : ''}`;

  if (foto) {
    // `alt` vazio de propósito: o nome está escrito ao lado nos dois usos, e
    // repeti-lo faria o leitor de tela dizer duas vezes a mesma coisa.
    return <img className={classes} src={foto} alt="" />;
  }

  return (
    <span className={`${classes} avatar--iniciais`} aria-hidden="true">
      {iniciaisDe(nome)}
    </span>
  );
}

export default Avatar;
