import PDFDocument from 'pdfkit';
import { ARCHETYPE_IDS, ARCHETYPES, getArchetype } from '../../shared/archetypes.js';
import { getCompatibility } from '../../shared/compatibility.js';
import type { ProductTier } from '../../shared/products.js';
import type { BlueprintContent } from './blueprint.js';

const PAGE = { width: 595.28, height: 841.89 }; // A4 portrait, points
const MARGIN = 62;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;

/** Printed on the cover. Asserted by the tests, so they must stay in step. */
const BASE_PAGES = 15;
const PREMIUM_PAGES = 23;

const INK = '#14121A';
const MUTED = '#6B6472';
const ROSE = '#C33C56';
const GOLD = '#A8873F';
const RULE = '#E4DDD3';
const PAPER = '#FBF8F3';

/**
 * PDFKit's built-in fonts are WinAnsi-encoded, so anything outside CP1252
 * (notably Hangul) cannot be drawn. Strip it rather than emit tofu, and keep
 * the typographic punctuation that CP1252 does cover.
 */
function sanitize(input: string): string {
  return String(input ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

type Doc = PDFKit.PDFDocument;

class Layout {
  constructor(
    private doc: Doc,
    private pageNumber = 0,
  ) {}

  /** Starts a new page and stamps the running header/footer furniture. */
  page(label?: string): this {
    if (this.pageNumber > 0) this.doc.addPage();
    this.pageNumber += 1;

    this.doc.rect(0, 0, PAGE.width, PAGE.height).fill(PAPER);

    if (label) {
      this.doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(GOLD)
        .text(sanitize(label).toUpperCase(), MARGIN, 44, {
          width: CONTENT_WIDTH,
          characterSpacing: 1.8,
        });
      this.doc
        .moveTo(MARGIN, 60)
        .lineTo(PAGE.width - MARGIN, 60)
        .lineWidth(0.6)
        .stroke(RULE);
    }

    // The footer sits below the bottom margin. PDFKit auto-inserts a page when
    // text crosses that boundary, so the margin is lifted for these two writes
    // and restored immediately — otherwise every page would spawn two more.
    const bottomMargin = this.doc.page.margins.bottom;
    this.doc.page.margins.bottom = 0;
    this.doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text('K-DRAMA DREAMS', MARGIN, PAGE.height - 46, {
        width: CONTENT_WIDTH / 2,
        characterSpacing: 1.2,
        lineBreak: false,
      })
      .text(String(this.pageNumber), MARGIN + CONTENT_WIDTH / 2, PAGE.height - 46, {
        width: CONTENT_WIDTH / 2,
        align: 'right',
        lineBreak: false,
      });
    this.doc.page.margins.bottom = bottomMargin;

    this.doc.y = label ? 92 : 84;
    this.doc.x = MARGIN;
    return this;
  }

  title(text: string, size = 26): this {
    this.doc
      .font('Times-Bold')
      .fontSize(size)
      .fillColor(INK)
      .text(sanitize(text), MARGIN, this.doc.y, { width: CONTENT_WIDTH, lineGap: 2 });
    this.doc.moveDown(0.6);
    return this;
  }

  kicker(text: string): this {
    this.doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(ROSE)
      .text(sanitize(text).toUpperCase(), MARGIN, this.doc.y, {
        width: CONTENT_WIDTH,
        characterSpacing: 1.6,
      });
    this.doc.moveDown(0.45);
    return this;
  }

  body(text: string, options: { size?: number; color?: string; italic?: boolean } = {}): this {
    const clean = sanitize(text);
    if (!clean) return this;
    this.doc
      .font(options.italic ? 'Times-Italic' : 'Times-Roman')
      .fontSize(options.size ?? 11.5)
      .fillColor(options.color ?? INK)
      .text(clean, MARGIN, this.doc.y, {
        width: CONTENT_WIDTH,
        align: 'left',
        lineGap: 3.4,
      });
    this.doc.moveDown(0.7);
    return this;
  }

  /** A left-ruled callout used for quotes and highlighted lines. */
  pullQuote(text: string): this {
    const clean = sanitize(text);
    if (!clean) return this;
    const top = this.doc.y;
    this.doc
      .font('Times-Italic')
      .fontSize(13)
      .fillColor(ROSE)
      .text(clean, MARGIN + 16, top + 4, { width: CONTENT_WIDTH - 16, lineGap: 3.5 });
    this.doc
      .moveTo(MARGIN, top)
      .lineTo(MARGIN, this.doc.y - 2)
      .lineWidth(2)
      .stroke(ROSE);
    this.doc.moveDown(0.9);
    return this;
  }

  /** Numbered heading + supporting paragraphs, the workhorse block. */
  entry(index: string, heading: string, lines: Array<{ label?: string; text: string }>): this {
    const top = this.doc.y;
    this.doc
      .font('Times-Bold')
      .fontSize(20)
      .fillColor(RULE)
      .text(index, MARGIN, top, { width: 34 });

    this.doc
      .font('Helvetica-Bold')
      .fontSize(11.5)
      .fillColor(INK)
      .text(sanitize(heading), MARGIN + 38, top + 3, { width: CONTENT_WIDTH - 38, lineGap: 2 });
    this.doc.moveDown(0.35);

    for (const line of lines) {
      if (!line.text) continue;
      const startY = this.doc.y;
      if (line.label) {
        this.doc
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .fillColor(GOLD)
          .text(sanitize(line.label).toUpperCase(), MARGIN + 38, startY + 1.5, {
            width: 54,
            characterSpacing: 1,
          });
        this.doc
          .font('Times-Roman')
          .fontSize(10.5)
          .fillColor(INK)
          .text(sanitize(line.text), MARGIN + 96, startY, {
            width: CONTENT_WIDTH - 96,
            lineGap: 3,
          });
      } else {
        this.doc
          .font('Times-Roman')
          .fontSize(10.5)
          .fillColor(MUTED)
          .text(sanitize(line.text), MARGIN + 38, startY, {
            width: CONTENT_WIDTH - 38,
            lineGap: 3,
          });
      }
      this.doc.moveDown(0.35);
    }

    this.doc.moveDown(0.5);
    this.doc.x = MARGIN;
    return this;
  }

  bullets(items: string[]): this {
    for (const item of items) {
      const clean = sanitize(item);
      if (!clean) continue;
      const top = this.doc.y;
      this.doc.circle(MARGIN + 3, top + 6, 2).fill(ROSE);
      this.doc
        .font('Times-Roman')
        .fontSize(11)
        .fillColor(INK)
        .text(clean, MARGIN + 16, top, { width: CONTENT_WIDTH - 16, lineGap: 3 });
      this.doc.moveDown(0.42);
    }
    this.doc.moveDown(0.4);
    this.doc.x = MARGIN;
    return this;
  }

  /** Labelled percentage bar used for the compatibility spread. */
  meter(label: string, percent: number, caption: string): this {
    const top = this.doc.y;
    const barWidth = CONTENT_WIDTH;
    const pct = Math.max(0, Math.min(100, percent));

    this.doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(INK)
      .text(sanitize(label), MARGIN, top, { width: barWidth - 46 })
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(ROSE)
      .text(`${pct}%`, MARGIN + barWidth - 46, top, { width: 46, align: 'right' });

    const barY = this.doc.y + 3;
    this.doc.roundedRect(MARGIN, barY, barWidth, 4, 2).fill(RULE);
    this.doc.roundedRect(MARGIN, barY, (barWidth * pct) / 100, 4, 2).fill(ROSE);

    this.doc.y = barY + 11;
    this.doc
      .font('Times-Italic')
      .fontSize(9.5)
      .fillColor(MUTED)
      .text(sanitize(caption), MARGIN, this.doc.y, { width: barWidth, lineGap: 2.5 });
    this.doc.moveDown(0.85);
    this.doc.x = MARGIN;
    return this;
  }
}

/**
 * Renders the 15-page blueprint. Resolves with the finished PDF bytes so the
 * caller can stream, email, or upload it.
 */
export function renderBlueprintPdf(
  content: BlueprintContent,
  meta: {
    name?: string | null;
    email: string;
    orderId: string;
    /**
     * Drives which edition is printed. The bundle tiers add the Dream Outcome
     * Script and the five archetype books — the deliverables their product
     * cards promise. Defaults to the base edition.
     */
    tier?: ProductTier;
  },
): Promise<Buffer> {
  const premium = meta.tier === 'bundle' || meta.tier === 'coaching';
  const pageCount = premium ? PREMIUM_PAGES : BASE_PAGES;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [PAGE.width, PAGE.height],
      margin: MARGIN,
      bufferPages: true,
      info: {
        Title: premium
          ? `${content.archetypeTitle} - Premium Bundle Edition`
          : `${content.archetypeTitle} - Romantic Blueprint`,
        Author: 'K-Drama Dreams',
        Subject: 'Personalised Romantic Blueprint & Compatibility Breakdown',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const L = new Layout(doc);
    const recipient = content && meta.name?.trim() ? meta.name.trim() : meta.email;

    // ---- 1. Cover -------------------------------------------------------
    L.page();
    doc.rect(0, 0, PAGE.width, PAGE.height).fill('#14121A');
    doc.rect(MARGIN - 18, 150, 2, 120).fill(ROSE);
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(GOLD)
      .text('K-DRAMA DREAMS', MARGIN, 96, { characterSpacing: 3 });
    doc
      .font('Times-Italic')
      .fontSize(13)
      .fillColor('#B9AFA4')
      .text(
        premium
          ? 'The Personalised Romantic Blueprint · Premium Edition'
          : 'The Personalised Romantic Blueprint',
        MARGIN,
        160,
        { width: CONTENT_WIDTH },
      );
    doc
      .font('Times-Bold')
      .fontSize(38)
      .fillColor('#F6F1E8')
      .text(sanitize(content.archetypeTitle), MARGIN, 194, {
        width: CONTENT_WIDTH,
        lineGap: 4,
      });
    doc
      .font('Times-Italic')
      .fontSize(14)
      .fillColor(ROSE)
      .text(sanitize(content.subtitle), MARGIN, doc.y + 14, { width: CONTENT_WIDTH });

    doc
      .moveTo(MARGIN, PAGE.height - 170)
      .lineTo(PAGE.width - MARGIN, PAGE.height - 170)
      .lineWidth(0.6)
      .stroke('#3A3440');
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor('#8C8391')
      .text('PREPARED FOR', MARGIN, PAGE.height - 152, { characterSpacing: 1.5 })
      .font('Times-Roman')
      .fontSize(12)
      .fillColor('#F6F1E8')
      .text(sanitize(recipient), MARGIN, PAGE.height - 138, { width: CONTENT_WIDTH });
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor('#6E6675')
      .text(
        `${pageCount} pages  ·  ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}  ·  Order ${meta.orderId.slice(0, 8)}`,
        MARGIN,
        PAGE.height - 96,
        { width: CONTENT_WIDTH },
      );

    // ---- 2. Opening letter ---------------------------------------------
    L.page('Chapter One').kicker('A letter, before anything else');
    L.title('Read this part twice.', 27);
    for (const paragraph of content.openingLetter.split(/\n{2,}/)) {
      L.body(paragraph, { size: 12 });
    }

    // ---- 3–4. Core truth ------------------------------------------------
    const truth = content.coreTruth.length ? content.coreTruth : [''];
    const truthFirst = truth.slice(0, 2);
    const truthRest = truth.slice(2);

    L.page('Chapter Two').kicker('What your answers actually said');
    L.title('The pattern underneath the pattern.');
    truthFirst.forEach((p) => L.body(p));

    L.page('Chapter Two (continued)');
    truthRest.forEach((p) => L.body(p));
    L.pullQuote(content.subtitle);

    // ---- 5. Love language ----------------------------------------------
    L.page('Chapter Three').kicker('How you receive love');
    L.title(content.loveLanguage.name || 'Your love language');
    L.body(content.loveLanguage.why);
    doc.moveDown(0.3);
    L.kicker('What this looks like in real life');
    L.bullets(content.loveLanguage.examples ?? []);

    // ---- 6. Strengths ---------------------------------------------------
    L.page('Chapter Four').kicker('Your romantic strengths');
    L.title('What you bring that most people cannot.');
    content.strengths.forEach((strength, i) => {
      L.entry(String(i + 1).padStart(2, '0'), strength.title, [{ text: strength.detail }]);
    });

    // ---- 7–8. Red flags -------------------------------------------------
    const flags = content.redFlags ?? [];
    L.page('Chapter Five').kicker('Warning patterns');
    L.title('The three habits that quietly cost you.');
    L.body(
      'These are not faults. They are the shadow side of the same wiring that makes you good at love. Naming them is how you keep the gift without paying the tax.',
      { color: MUTED },
    );
    flags.slice(0, 2).forEach((flag, i) => {
      L.entry(String(i + 1).padStart(2, '0'), flag.pattern, [
        { label: 'Why', text: flag.why },
        { label: 'Reframe', text: flag.reframe },
      ]);
    });

    L.page('Chapter Five (continued)');
    flags.slice(2).forEach((flag, i) => {
      L.entry(String(i + 3).padStart(2, '0'), flag.pattern, [
        { label: 'Why', text: flag.why },
        { label: 'Reframe', text: flag.reframe },
      ]);
    });
    L.pullQuote('Small conversations prevent large ones.');

    // ---- 9–10. Communication -------------------------------------------
    const tips = content.communicationTips ?? [];
    L.page('Chapter Six').kicker('Scripts for the hard moments');
    L.title('What to say when it matters.');
    tips.slice(0, 3).forEach((tip, i) => {
      L.entry(String(i + 1).padStart(2, '0'), tip.situation, [
        { label: 'Say', text: tip.say },
        { label: 'Avoid', text: tip.avoid },
      ]);
    });

    L.page('Chapter Six (continued)');
    tips.slice(3).forEach((tip, i) => {
      L.entry(String(i + 4).padStart(2, '0'), tip.situation, [
        { label: 'Say', text: tip.say },
        { label: 'Avoid', text: tip.avoid },
      ]);
    });

    // ---- 11. Compatibility ----------------------------------------------
    L.page('Chapter Seven').kicker('Compatibility breakdown');
    L.title('You, against the other four.');
    L.body(
      'Percentages describe narrative chemistry - how much friction, comfort, and growth the pairing generates. High is not automatically better; it simply means fewer surprises.',
      { color: MUTED, size: 10.5 },
    );
    doc.moveDown(0.2);
    (content.compatibility ?? []).forEach((row) => {
      L.meter(row.archetype, row.percent, `${row.dynamic} - ${row.advice}`);
    });

    // ---- 12. Dream scenario ---------------------------------------------
    L.page('Chapter Eight').kicker('Your dream outcome scene');
    L.title(content.dreamScenario.title || 'Final Episode');
    if (sanitize(content.dreamScenario.hangul)) {
      L.body(content.dreamScenario.hangul, { italic: true, color: GOLD });
    }
    (content.dreamScenario.scenes ?? []).forEach((scene, i) => {
      const top = doc.y;
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(ROSE)
        .text(`BEAT ${i + 1}`, MARGIN, top + 2, { width: 48, characterSpacing: 1 });
      doc
        .font('Times-Italic')
        .fontSize(11)
        .fillColor(INK)
        .text(sanitize(scene), MARGIN + 56, top, {
          width: CONTENT_WIDTH - 56,
          lineGap: 3,
        });
      doc.moveDown(0.55);
      doc.x = MARGIN;
    });

    // ---- 13–14. 30-day plan + affirmations ------------------------------
    const plan = content.thirtyDayPlan ?? [];
    L.page('Chapter Nine').kicker('Your next 30 days');
    L.title('Small moves, in order.');
    plan.slice(0, 2).forEach((week) => {
      L.entry(week.week.replace(/\D/g, '') || '1', `${week.week} - ${week.focus}`, []);
      L.bullets(week.actions ?? []);
    });

    L.page('Chapter Nine (continued)');
    plan.slice(2).forEach((week) => {
      L.entry(week.week.replace(/\D/g, '') || '3', `${week.week} - ${week.focus}`, []);
      L.bullets(week.actions ?? []);
    });
    doc.moveDown(0.4);
    L.kicker('Seven lines to keep');
    (content.affirmations ?? []).forEach((line) => {
      L.body(line, { italic: true, size: 11.5, color: ROSE });
    });

    // ---- Premium edition only: the two bundle deliverables ---------------
    if (premium) {
      const script = content.dreamScript;
      const beats = script?.beats ?? [];

      const renderBeats = (slice: typeof beats) => {
        slice.forEach((beat) => {
          doc
            .font('Helvetica-Bold')
            .fontSize(8.5)
            .fillColor(ROSE)
            .text(sanitize(beat.heading), MARGIN, doc.y, {
              width: CONTENT_WIDTH,
              characterSpacing: 0.8,
            });
          doc.moveDown(0.35);
          doc
            .font('Times-Roman')
            .fontSize(11)
            .fillColor(INK)
            .text(sanitize(beat.direction), MARGIN, doc.y, {
              width: CONTENT_WIDTH,
              lineGap: 3,
            });
          doc.moveDown(0.4);
          // Dialogue is centred and inset, the way a screenplay sets it.
          doc
            .font('Times-Italic')
            .fontSize(11.5)
            .fillColor(GOLD)
            .text(`"${sanitize(beat.line)}"`, MARGIN + 78, doc.y, {
              width: CONTENT_WIDTH - 156,
              align: 'center',
              lineGap: 2.5,
            });
          doc.moveDown(0.9);
          doc.x = MARGIN;
        });
      };

      L.page('Chapter Ten').kicker('Bundle exclusive · your dream outcome script');
      L.title('The scene, written to be filmed.');
      if (script?.logline) {
        L.body(script.logline, { italic: true, color: MUTED, size: 11 });
        doc.moveDown(0.3);
      }
      renderBeats(beats.slice(0, 3));

      L.page('Chapter Ten (continued)');
      renderBeats(beats.slice(3));
      L.pullQuote('You already know how this scene ends. That is the point.');

      // ---- The five archetype books -------------------------------------
      L.page('Chapter Eleven').kicker('Bundle exclusive · the five archetype books');
      L.title('Everyone else you could love.');
      L.body(
        'The main blueprint reads you. These five read everyone else. One book per archetype: how they love, what they need, and precisely how they pair with you.',
        { color: MUTED },
      );
      doc.moveDown(0.2);
      ARCHETYPE_IDS.forEach((id) => {
        const other = ARCHETYPES[id];
        const match = getCompatibility(content.archetype, id);
        L.meter(
          `${other.title}${id === content.archetype ? ' (you)' : ''}`,
          match.percent,
          match.label,
        );
      });

      ARCHETYPE_IDS.forEach((id, index) => {
        const other = getArchetype(id);
        const match = getCompatibility(content.archetype, id);
        const isSelf = id === content.archetype;

        L.page(`Book ${index + 1} of 5`).kicker(
          isSelf ? 'Your own archetype, from the outside' : `Pairing with ${other.title}`,
        );
        L.title(other.title, 27);
        L.body(other.essence, { italic: true, color: ROSE, size: 12 });
        L.body(other.desc);

        L.kicker('How they love');
        L.body(`${other.trait}. ${other.traitExplanation}`);

        L.entry('01', `Love language: ${other.loveLanguage}`, [
          { text: `What reaches them: ${other.signals.join('; ')}.` },
        ]);
        L.entry('02', `With you: ${match.label} (${match.percent}%)`, [
          { text: match.desc },
          {
            label: isSelf ? 'Note' : 'Advice',
            text: isSelf
              ? 'Two of the same archetype understand each other instantly and can stall just as fast — someone eventually has to move first.'
              : `Lead with ${other.loveLanguage.toLowerCase()} and you will be speaking their language before you say anything at all.`,
          },
        ]);
      });
    }

    // ---- 15. Closing -----------------------------------------------------
    L.page('The last page').kicker('Before you close this');
    L.title('One more thing.');
    L.body(content.closing, { size: 12 });
    doc.moveDown(1.4);
    doc
      .moveTo(MARGIN, doc.y)
      .lineTo(PAGE.width - MARGIN, doc.y)
      .lineWidth(0.6)
      .stroke(RULE);
    doc.moveDown(1);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        content.aiGenerated
          ? 'Written for you from your own quiz answers. Crafted for entertainment and creative self-reflection, not clinical advice.'
          : 'Crafted for entertainment and creative self-reflection, not clinical advice.',
        MARGIN,
        doc.y,
        { width: CONTENT_WIDTH, lineGap: 2.5 },
      );
    doc.moveDown(0.8);
    doc
      .font('Times-Italic')
      .fontSize(11)
      .fillColor(ROSE)
      .text('K-Drama Dreams', MARGIN, doc.y, { width: CONTENT_WIDTH });

    doc.end();
  });
}
