import fs from 'node:fs';
const file = 'src/data/content.json';
const pages = JSON.parse(fs.readFileSync(file, 'utf8'));
const guide = pages.find(p => p.path.includes('litter-box-guide'));
const replacements = [
 ['Interior about 19 × 18 inches; entry 15.75 × 15.75 inches', 'Published chamber dimensions about 19 × 18 inches; entry 15.75 × 15.75 inches. Usable floor dimensions not verified.'],
 ['The measurements lead to a useful conclusion. An 18-inch cat has a target box length of about 27 inches. On paper, that puts two examples above the target, one below it, and the automatic chamber well below it. Real fit still depends on the interior shape, but the calculation quickly removes products that are unlikely to work.', 'An 18-inch body measurement gives a starting target of about 27 inches. The table mixes overall product dimensions and chamber dimensions, so those figures cannot establish which usable floors meet that target. Ask for the flat interior floor length and width for the exact model. Until those measurements are verified, fit remains unverified.'],
 ['Some can. Litter-Robot lists the Litter-Robot 4 interior at about 19 inches wide by 18 inches deep. Compare that space with your cat’s body length and turning posture rather than relying on breed or weight alone. Introduce it slowly and keep a conventional box available.', 'Some may, but the published chamber dimensions do not establish usable floor space. Ask for the exact model’s usable floor measurements, check the manufacturer’s operating requirements, and assess entry and turning space for your cat. Fit remains unverified until the necessary measurements are available. Keep a conventional box available during introduction.']
];
for (const [before,after] of replacements) {
  if (!guide.html.includes(before)) throw new Error('Expected measurement passage not found: '+before.slice(0,50));
  guide.html = guide.html.replace(before,after);
}
// Preserve numeric ranges and source URLs; remove long punctuation dashes only from text.
for (const p of pages) {
  p.description = p.description.replace(/—/g, ', ').replace(/–/g, '-');
  p.html = p.html.split(/(<[^>]+>)/g).map(s=>s.startsWith('<')?s:s.replace(/—/g, ', ').replace(/–/g, '-')).join('');
}
fs.writeFileSync(file, JSON.stringify(pages,null,2)+'\n');
