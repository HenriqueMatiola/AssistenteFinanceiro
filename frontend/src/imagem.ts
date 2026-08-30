/**
 * Preparo da foto de perfil, feito no navegador antes de enviar.
 *
 * A foto de um celular tem 4 MB e 4000px de lado; o app a mostra num círculo
 * de 30px. Reduzir aqui, e não no servidor, poupa a subida do arquivo inteiro
 * e dispensa biblioteca de imagem no backend.
 */

/** Lado do quadrado final. 256px cobre com folga o maior uso (o crachá do perfil). */
const LADO = 256;

/** Acima disto nem tentamos decodificar: é foto sem tratamento, e trava a aba. */
const MAXIMO_DO_ARQUIVO = 12 * 1024 * 1024;

const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'];

/** Erro com mensagem pronta para mostrar na tela. */
export class ErroDeImagem extends Error {}

/**
 * Recorta a imagem no centro, reduz para um quadrado e devolve o data URI.
 *
 * O recorte é central porque a foto aparece dentro de um círculo: encaixar a
 * imagem inteira deixaria barras, e esticar deformaria o rosto.
 */
export async function prepararFotoDePerfil(arquivo: File): Promise<string> {
  if (!TIPOS_ACEITOS.includes(arquivo.type)) {
    throw new ErroDeImagem('Escolha uma imagem JPEG, PNG ou WebP.');
  }

  if (arquivo.size > MAXIMO_DO_ARQUIVO) {
    throw new ErroDeImagem('Essa imagem é grande demais. Escolha uma de até 12 MB.');
  }

  let imagem: ImageBitmap;
  try {
    // `from-image` respeita a orientação gravada pela câmera; sem isso, foto
    // tirada em pé chega deitada.
    imagem = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    throw new ErroDeImagem('Não consegui abrir essa imagem.');
  }

  try {
    const lado = Math.min(imagem.width, imagem.height);
    const origemX = (imagem.width - lado) / 2;
    const origemY = (imagem.height - lado) / 2;

    const tela = document.createElement('canvas');
    tela.width = LADO;
    tela.height = LADO;

    const pincel = tela.getContext('2d');
    if (!pincel) throw new ErroDeImagem('Não consegui preparar a imagem.');

    // JPEG não guarda transparência: sem este fundo, um PNG transparente
    // sairia com o fundo preto.
    pincel.fillStyle = '#ffffff';
    pincel.fillRect(0, 0, LADO, LADO);
    pincel.drawImage(imagem, origemX, origemY, lado, lado, 0, 0, LADO, LADO);

    // 0.82 é o ponto em que o arquivo cai para dezenas de KB sem que a
    // diferença apareça num círculo pequeno.
    return tela.toDataURL('image/jpeg', 0.82);
  } finally {
    // Libera a memória do bitmap decodificado, que não é pouca numa foto de
    // celular.
    imagem.close();
  }
}
