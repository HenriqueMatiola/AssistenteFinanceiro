/**
 * Regras da foto de perfil.
 *
 * A foto chega como data URI, do jeito que o navegador produz depois de
 * reduzir a imagem. Aqui conferimos que é mesmo imagem, de um formato que todo
 * navegador desenha, e que cabe numa linha do banco sem virar um problema.
 */
import { ErroDeValidacao } from './validacao.ts';

/**
 * Só formatos que qualquer navegador abre. SVG fica de fora de propósito: ele
 * é documento, não bitmap — aceita script dentro, e a foto vai ser mostrada
 * para a outra pessoa que usa o app.
 */
const FORMATOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Teto de 400 KB já decodificados.
 *
 * O navegador manda uns 20 KB depois de reduzir para 256px, então isto não
 * atrapalha o uso normal — serve para barrar quem mandasse a foto original de
 * 8 megapixels direto pela API.
 */
export const TAMANHO_MAXIMO_DA_FOTO = 400 * 1024;

const FORMATO_DATA_URI = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/]+={0,2})$/;

/**
 * Quantos bytes o base64 vira depois de decodificado.
 *
 * A conta sai do tamanho do texto, sem decodificar nada: cada 4 caracteres
 * viram 3 bytes, e cada '=' no fim representa um byte que não existe.
 */
export function bytesDoBase64(base64: string): number {
  const enchimento = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (base64.length * 3) / 4 - enchimento;
}

/**
 * Confere a foto e devolve ela como veio.
 *
 * `null` é resposta válida e significa "tirar a foto": a interface precisa de
 * um jeito de voltar para as iniciais.
 */
export function validarFotoDePerfil(bruto: unknown): string | null {
  if (bruto === null) return null;

  if (typeof bruto !== 'string') {
    throw new ErroDeValidacao('Foto inválida.');
  }

  const partes = FORMATO_DATA_URI.exec(bruto);

  if (!partes) {
    throw new ErroDeValidacao('Foto inválida: envie uma imagem.');
  }

  const [, tipo, base64] = partes as unknown as [string, string, string];

  if (!FORMATOS_ACEITOS.includes(tipo)) {
    throw new ErroDeValidacao('A foto precisa ser JPEG, PNG ou WebP.');
  }

  if (bytesDoBase64(base64) > TAMANHO_MAXIMO_DA_FOTO) {
    throw new ErroDeValidacao(
      `A foto passa de ${Math.round(TAMANHO_MAXIMO_DA_FOTO / 1024)} KB. Escolha uma menor.`
    );
  }

  return bruto;
}
