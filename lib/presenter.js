import PptxGenJS from 'pptxgenjs';

// Космическая палитра для создаваемых презентаций
const COLORS = {
  bg: '0B1026',        // тёмно-синий космос
  bg2: '141B3A',       // чуть светлее
  accent: '7C5CFF',    // фиолетовый
  accent2: '00D9FF',   // голубой неон
  text: 'FFFFFF',
  muted: 'B8C2E0'
};

/**
 * Собирает .pptx из плана слайдов и сохраняет файл.
 * @param {{title:string, subtitle?:string, slides:Array<{title:string, bullets?:string[], note?:string}>}} plan
 * @param {string} filePath куда сохранить
 */
export async function buildPptx(plan, filePath) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.theme = { headFontFace: 'Segoe UI', bodyFontFace: 'Segoe UI' };

  // Титульный слайд
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: COLORS.bg };
  titleSlide.addShape(pptx.ShapeType.ellipse, { x: 10.6, y: 1.2, w: 3.4, h: 3.4, fill: { color: COLORS.accent }, transparency: 60 });
  titleSlide.addShape(pptx.ShapeType.ellipse, { x: 0.2, y: 4.6, w: 3.0, h: 3.0, fill: { color: COLORS.accent2 }, transparency: 70 });
  titleSlide.addText('✦', { x: 8.8, y: 2.4, w: 1, h: 1, fontSize: 40, color: COLORS.accent2, align: 'center' });
  titleSlide.addText(plan.title, { x: 0.8, y: 2.2, w: 12.4, h: 1.6, fontSize: 40, bold: true, color: COLORS.text, align: 'center', fontFace: 'Segoe UI Semibold' });
  if (plan.subtitle) {
    titleSlide.addText(plan.subtitle, { x: 1.5, y: 3.9, w: 11.0, h: 0.7, fontSize: 18, color: COLORS.muted, align: 'center' });
  }

  // Слайды с контентом
  for (const s of plan.slides || []) {
    const slide = pptx.addSlide();
    slide.background = { color: COLORS.bg };
    // декоративная полоса
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.28, h: 7.5, fill: { color: COLORS.accent } });
    slide.addText('COSSMO',
      { x: 11.4, y: 6.9, w: 3, h: 0.4, fontSize: 9, color: COLORS.accent2, charSpacing: 2, align: 'right', transparency: 50 });
    slide.addText(s.title, {
      x: 0.6, y: 0.55, w: 12.2, h: 0.9,
      fontSize: 28, bold: true, color: COLORS.text, fontFace: 'Segoe UI Semibold'
    });
    const bullets = (s.bullets && s.bullets.length ? s.bullets : ['Пояснение по теме.']).map((b) => String(b));
    const totalChars = bullets.join(' ').length;
    // Авто-подбор размера шрифта: чем больше текста, тем мельче, чтобы всё уместилось
    let fontSize = 16;
    if (totalChars > 220) fontSize = 15;
    if (totalChars > 340) fontSize = 14;
    if (totalChars > 480) fontSize = 12.5;
    if (totalChars > 640) fontSize = 11;
    if (totalChars > 820) fontSize = 10;
    if (totalChars > 1000) fontSize = 9;
    slide.addText(
      bullets.map((b) => ({ text: b, options: { bullet: { code: '2022' } } })),
      {
        x: 0.9, y: 1.7, w: 11.2, h: 5.1,
        fontSize, color: COLORS.text, valign: 'top',
        lineSpacingMultiple: 1.18, paraSpaceAfter: 7
      }
    );
    if (s.note) slide.addNotes(String(s.note));
  }

  await pptx.writeFile({ fileName: filePath });
  return filePath;
}