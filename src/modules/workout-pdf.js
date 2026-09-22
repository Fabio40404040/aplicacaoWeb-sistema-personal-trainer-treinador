const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const COLORS = {
  blue: "0.035 0.302 0.796",
  blueDark: "0.027 0.145 0.357",
  cyan: "0.055 0.690 0.824",
  cyanSoft: "0.855 0.961 0.976",
  ink: "0.039 0.098 0.196",
  muted: "0.380 0.447 0.553",
  line: "0.745 0.788 0.847",
  panel: "0.941 0.953 0.969",
  white: "1 1 1",
};
const THEMES = {
  blue: {
    blue: "0.035 0.302 0.796",
    blueDark: "0.027 0.145 0.357",
    cyan: "0.055 0.690 0.824",
  },
  red: {
    blue: "0.780 0.020 0.020",
    blueDark: "0.180 0.180 0.180",
    cyan: "0.925 0.180 0.180",
  },
  green: {
    blue: "0.020 0.500 0.280",
    blueDark: "0.020 0.250 0.160",
    cyan: "0.120 0.700 0.450",
  },
  black: {
    blue: "0.100 0.100 0.100",
    blueDark: "0.025 0.025 0.025",
    cyan: "0.400 0.400 0.400",
  },
};

function ascii(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\x20-\x7E]/gu, "");
}

function escapePdf(value) {
  return ascii(value).replace(/([\\()])/gu, "\\$1");
}

function truncate(value, length) {
  const content = ascii(value).trim();
  return content.length > length
    ? `${content.slice(0, Math.max(1, length - 3))}...`
    : content;
}

// Em vez de cortar o nome do aluno com "...", diminui a fonte quando o nome
// é mais comprido do que o espaço reservado — assim o nome completo sempre
// aparece por inteiro na ficha.
function fitText(value, maxChars, baseSize, minSize = 8) {
  const content = ascii(value).trim();
  if (!content) return { text: "", size: baseSize };
  const ratio = content.length / maxChars;
  const size = ratio > 1 ? Math.max(minSize, baseSize / ratio) : baseSize;
  return { text: content, size };
}

function text(commands, value, x, top, size = 10, options = {}) {
  const font = options.bold ? "F2" : "F1";
  const color = options.color || COLORS.ink;
  commands.push(
    `BT ${color} rg /${font} ${size} Tf ${x} ${PAGE_HEIGHT - top - size} Td (${escapePdf(value)}) Tj ET`,
  );
}

function rect(
  commands,
  x,
  top,
  width,
  height,
  fill,
  stroke = null,
  lineWidth = 1,
) {
  const y = PAGE_HEIGHT - top - height;
  const paint = stroke ? "B" : "f";
  commands.push(
    `${lineWidth} w ${fill} rg ${stroke || fill} RG ${x} ${y} ${width} ${height} re ${paint}`,
  );
}

function line(commands, x1, top1, x2, top2, color = COLORS.line, width = 1) {
  commands.push(
    `${width} w ${color} RG ${x1} ${PAGE_HEIGHT - top1} m ${x2} ${PAGE_HEIGHT - top2} l S`,
  );
}

function circle(commands, x, top, radius, fill, stroke = null) {
  const y = PAGE_HEIGHT - top;
  const k = radius * 0.55228475;
  commands.push(
    `${fill} rg ${stroke || fill} RG ${x + radius} ${y} m ` +
      `${x + radius} ${y + k} ${x + k} ${y + radius} ${x} ${y + radius} c ` +
      `${x - k} ${y + radius} ${x - radius} ${y + k} ${x - radius} ${y} c ` +
      `${x - radius} ${y - k} ${x - k} ${y - radius} ${x} ${y - radius} c ` +
      `${x + k} ${y - radius} ${x + radius} ${y - k} ${x + radius} ${y} c B`,
  );
}

function drawExerciseFigure(commands, x, top, number) {
  rect(commands, x, top, 142, 104, COLORS.white);
  circle(commands, x + 70, top + 27, 9, COLORS.cyanSoft, COLORS.cyan);
  line(commands, x + 70, top + 36, x + 70, top + 67, COLORS.blueDark, 4);
  line(commands, x + 70, top + 44, x + 45, top + 57, COLORS.blueDark, 4);
  line(commands, x + 70, top + 44, x + 95, top + 57, COLORS.blueDark, 4);
  line(commands, x + 70, top + 67, x + 51, top + 89, COLORS.blueDark, 4);
  line(commands, x + 70, top + 67, x + 89, top + 89, COLORS.blueDark, 4);
  line(commands, x + 35, top + 57, x + 105, top + 57, COLORS.cyan, 3);
  line(commands, x + 34, top + 49, x + 34, top + 65, COLORS.blue, 5);
  line(commands, x + 106, top + 49, x + 106, top + 65, COLORS.blue, 5);
  text(
    commands,
    `EXERCICIO ${String(number).padStart(2, "0")}`,
    x + 8,
    top + 88,
    7,
    {
      bold: true,
      color: COLORS.muted,
    },
  );
}

function drawHeader(commands, workout, studentName, continuation = false) {
  rect(commands, 25, 20, 545, 52, COLORS.blue);
  const titleFit = fitText(
    continuation ? "FICHA DE TREINO (CONT.)" : "FICHA DE TREINO",
    24,
    22,
    14,
  );
  text(commands, titleFit.text, 42, 31, titleFit.size, {
    bold: true,
    color: COLORS.white,
  });
  text(commands, "FRS PERSONAL TRAINER", 414, 37, 9, {
    bold: true,
    color: COLORS.white,
  });
  rect(commands, 25, 80, 545, 54, COLORS.panel, COLORS.line);
  text(commands, "ALUNO", 39, 92, 7, { bold: true, color: COLORS.muted });
  const alunoFit = fitText(studentName, 30, 13, 9);
  text(commands, alunoFit.text, 39, 105, alunoFit.size, { bold: true });
  text(commands, "PROGRAMA", 255, 92, 7, { bold: true, color: COLORS.muted });
  const programFit = fitText(workout.name, 27, 11, 8);
  text(commands, programFit.text, 255, 105, programFit.size, { bold: true });
  text(commands, "OBJETIVO / DURACAO", 430, 92, 7, {
    bold: true,
    color: COLORS.muted,
  });
  text(commands, truncate(workout.goal || "Treinamento", 20), 430, 104, 9, {
    bold: true,
  });
  text(commands, truncate(workout.duration || "A definir", 20), 430, 117, 8, {
    color: COLORS.muted,
  });
  return 146;
}

function drawCover(workout, studentName) {
  const commands = [];
  rect(commands, 0, 0, PAGE_WIDTH, PAGE_HEIGHT, COLORS.ink);
  rect(commands, 25, 25, 545, 7, COLORS.cyan);
  text(commands, "FRS PERSONAL TRAINER", 42, 58, 12, {
    bold: true,
    color: COLORS.cyan,
  });
  text(
    commands,
    workout.readyProgram ? "TREINO PRONTO" : "FICHA PERSONALIZADA",
    42,
    102,
    15,
    {
      bold: true,
      color: COLORS.white,
    },
  );
  text(commands, truncate(workout.name, 26).toUpperCase(), 42, 145, 31, {
    bold: true,
    color: COLORS.white,
  });
  rect(commands, 42, 213, 511, 3, COLORS.blue);
  text(commands, workout.goal || "Treinamento", 42, 240, 18, {
    bold: true,
    color: COLORS.cyan,
  });
  text(
    commands,
    `${workout.duration || "Duracao definida"} · Programa completo`,
    42,
    271,
    12,
    {
      color: COLORS.white,
    },
  );
  text(
    commands,
    workout.readyProgram ? "ACESSO PERMANENTE" : "ALUNO",
    42,
    590,
    9,
    {
      bold: true,
      color: COLORS.cyan,
    },
  );
  const coverNameFit = fitText(studentName.toUpperCase(), 44, 22, 12);
  text(commands, coverNameFit.text, 42, 614, coverNameFit.size, {
    bold: true,
    color: COLORS.white,
  });
  text(commands, "Treinamento com orientação profissional", 42, 662, 11, {
    color: COLORS.line,
  });
  rect(commands, 42, 738, 82, 52, COLORS.blue);
  text(commands, "FRS", 60, 751, 22, { bold: true, color: COLORS.white });
  text(commands, "PERSONAL TRAINER", 142, 752, 14, {
    bold: true,
    color: COLORS.white,
  });
  text(commands, "Ficha de treino gerada pelo sistema FRS", 142, 774, 8, {
    color: COLORS.line,
  });
  return commands;
}

function drawGroupHeader(commands, group, top) {
  rect(commands, 25, top, 545, 28, COLORS.blueDark);
  rect(commands, 25, top, 10, 28, COLORS.cyan);
  text(commands, ascii(group || "OUTROS").toUpperCase(), 45, top + 7, 13, {
    bold: true,
    color: COLORS.white,
  });
}

function drawExerciseCard(commands, exercise, top, number) {
  rect(commands, 25, top, 545, 128, COLORS.panel, COLORS.ink, 1.2);
  rect(commands, 25, top, 27, 128, COLORS.cyan);
  text(commands, String(number).padStart(2, "0"), 31, top + 54, 11, {
    bold: true,
    color: COLORS.white,
  });
  drawExerciseFigure(commands, 59, top + 12, number);
  const infoX = 214;
  text(
    commands,
    truncate(exercise.name, 38).toUpperCase(),
    infoX,
    top + 12,
    13,
    {
      bold: true,
      color: COLORS.blueDark,
    },
  );
  text(
    commands,
    truncate(
      `${exercise.equipment || "Livre"} - ${exercise.difficulty || "Intermediario"}`,
      50,
    ),
    infoX,
    top + 31,
    8,
    { color: COLORS.muted },
  );
  rect(commands, infoX, top + 48, 134, 27, COLORS.white);
  text(commands, "SERIES", infoX + 10, top + 56, 10, { bold: true });
  rect(commands, infoX + 140, top + 48, 64, 27, COLORS.cyan);
  text(commands, String(exercise.sets || 3), infoX + 165, top + 54, 13, {
    bold: true,
    color: COLORS.white,
  });
  rect(commands, infoX, top + 80, 134, 27, COLORS.white);
  text(commands, "REPETICOES", infoX + 10, top + 88, 10, { bold: true });
  rect(commands, infoX + 140, top + 80, 64, 27, COLORS.blue);
  text(
    commands,
    truncate(exercise.repetitions || "10-12", 9),
    infoX + 151,
    top + 86,
    11,
    {
      bold: true,
      color: COLORS.white,
    },
  );
  circle(commands, 520, top + 76, 31, COLORS.white, COLORS.ink);
  text(commands, "INTERVALO", 492, top + 55, 7, { bold: true });
  text(commands, `${Number(exercise.restSeconds) || 0}s`, 505, top + 70, 12, {
    bold: true,
  });
  const note = exercise.notes || exercise.instructions;
  if (note)
    text(commands, truncate(note, 73), infoX, top + 113, 7, {
      color: COLORS.muted,
    });
}

function normalizedExercises(workout) {
  const exercises = Array.isArray(workout.exercises)
    ? workout.exercises
    : Array.isArray(workout.exercisePrescriptions)
      ? workout.exercisePrescriptions
      : [];
  return exercises
    .map((exercise, index) => ({
      ...exercise,
      name: exercise.name || `Exercicio ${index + 1}`,
      group: exercise.group || "Outros",
      sessionLabel: String(exercise.sessionLabel || "A").toUpperCase(),
      originalPosition: Number(exercise.position) || index,
    }))
    .sort(
      (a, b) =>
        a.sessionLabel.localeCompare(b.sessionLabel) ||
        a.originalPosition - b.originalPosition,
    );
}

function buildPages(workout, studentName) {
  const pages = [drawCover(workout, studentName)];
  let commands = [];
  let top = drawHeader(commands, workout, studentName);
  let previousSession = "";
  const exercises = normalizedExercises(workout);
  if (!exercises.length) {
    rect(commands, 25, top, 545, 86, COLORS.panel, COLORS.line);
    text(commands, "NENHUM EXERCICIO ADICIONADO", 45, top + 22, 14, {
      bold: true,
      color: COLORS.blueDark,
    });
    text(
      commands,
      "Edite esta ficha no painel e selecione os exercicios da biblioteca.",
      45,
      top + 49,
      10,
      { color: COLORS.muted },
    );
  }
  exercises.forEach((exercise, index) => {
    const newSession = exercise.sessionLabel !== previousSession;
    const needed = (newSession ? 36 : 0) + 136;
    if (top + needed > 803) {
      pages.push(commands);
      commands = [];
      top = drawHeader(commands, workout, studentName, true);
      previousSession = "";
    }
    if (exercise.sessionLabel !== previousSession) {
      const sessionItems = exercises.filter(
        (item) => item.sessionLabel === exercise.sessionLabel,
      );
      const groups = [...new Set(sessionItems.map((item) => item.group))].join(
        " / ",
      );
      drawGroupHeader(
        commands,
        `TREINO ${exercise.sessionLabel} - ${groups}`,
        top,
      );
      top += 36;
      previousSession = exercise.sessionLabel;
    }
    drawExerciseCard(commands, exercise, top, index + 1);
    top += 136;
  });
  pages.push(commands);
  const footerName = ascii(studentName).trim() || "Aluno(a)";
  pages.forEach((page, index) => {
    line(page, 25, 818, 570, 818);
    text(
      page,
      `FRS Personal Trainer - Aluno(a): ${footerName}`,
      25,
      824,
      7,
      {
        color: COLORS.muted,
      },
    );
    text(page, `Pagina ${index + 1} de ${pages.length}`, 515, 824, 7, {
      color: COLORS.muted,
    });
    drawWatermark(page);
  });
  return pages;
}

// Marca d'água "FRS-PERSONAL" repetida na diagonal, desenhada por cima de
// tudo com transparência real (ExtGState /GS1), então aparece mesmo sobre
// os cartões coloridos dos exercícios.
function drawWatermark(commands) {
  const label = escapePdf("FRS-PERSONAL");
  const angle = (35 * Math.PI) / 180;
  const cos = Math.cos(angle).toFixed(4);
  const sin = Math.sin(angle).toFixed(4);
  // Evita a faixa do cabeçalho (título, nome e programa) e do rodapé, pra
  // não desenhar a marca d'água em cima de texto fino e "embaralhar" as
  // letras. A fonte menor (26) também reduz o tamanho de cada carimbo.
  const positions = [
    [70, 60],
    [320, 60],
    [70, 290],
    [320, 290],
    [70, 520],
    [320, 520],
  ];
  commands.push("q /GS1 gs 0.45 0.45 0.45 rg");
  positions.forEach(([x, y]) => {
    commands.push(
      `BT /F2 26 Tf ${cos} ${sin} ${-sin} ${cos} ${x} ${y} Tm (${label}) Tj ET`,
    );
  });
  commands.push("Q");
}

function pdfDocument(pages) {
  const objects = [];
  const pageIds = pages.map((_, index) => 3 + index * 2);
  const regularFontId = 3 + pages.length * 2;
  const boldFontId = regularFontId + 1;
  const watermarkGsId = boldFontId + 1;
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  pages.forEach((pageCommands, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const commands = pageCommands.join("\n");
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> /ExtGState << /GS1 ${watermarkGsId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] =
      `<< /Length ${new TextEncoder().encode(commands).length} >>\nstream\n${commands}\nendstream`;
  });
  objects[regularFontId] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[boldFontId] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  objects[watermarkGsId] = "<< /Type /ExtGState /ca 0.14 /CA 0.14 >>";
  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = new TextEncoder().encode(output).length;
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = new TextEncoder().encode(output).length;
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1)
    output += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(output);
}

export function buildWorkoutPdfBytes(workout, studentName) {
  const original = {
    blue: COLORS.blue,
    blueDark: COLORS.blueDark,
    cyan: COLORS.cyan,
  };
  Object.assign(COLORS, THEMES[workout.colorTheme] || THEMES.blue);
  try {
    return pdfDocument(buildPages(workout, studentName));
  } finally {
    Object.assign(COLORS, original);
  }
}

export function downloadWorkoutPdf(workout, studentName) {
  const blob = new Blob([buildWorkoutPdfBytes(workout, studentName)], {
    type: "application/pdf",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${
    ascii(`${studentName}-${workout.name}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-") || "ficha-treino"
  }.pdf`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 30_000);
}

// Mostra a ficha num visualizador embutido na própria página, sem oferecer
// o botão de salvar/baixar do navegador (o "toolbar=0" remove o ícone de
// download do leitor de PDF nativo do Chrome/Edge). Isso não impede 100% a
// cópia — um usuário decidido sempre consegue tirar print ou usar "imprimir
// em PDF" do sistema — mas tira o "baixar com um clique" da tela do aluno.
export function previewWorkoutPdf(workout, studentName) {
  const blob = new Blob([buildWorkoutPdfBytes(workout, studentName)], {
    type: "application/pdf",
  });
  const url = URL.createObjectURL(blob);
  const dialog = document.createElement("dialog");
  dialog.className = "workout-pdf-preview";
  Object.assign(dialog.style, {
    width: "min(880px, 96vw)",
    height: "min(90vh, 1000px)",
    padding: "0",
    border: "none",
    borderRadius: "12px",
    overflow: "hidden",
  });
  dialog.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;">
      <header style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid #e2e2e2;">
        <strong>Ficha de treino</strong>
        <button type="button" class="icon-button" data-close-pdf-preview aria-label="Fechar">×</button>
      </header>
      <iframe src="${url}#toolbar=0&navpanes=0" style="flex:1;border:0;" title="Ficha de treino em PDF"></iframe>
    </div>
  `;
  document.body.append(dialog);
  const cleanup = () => {
    URL.revokeObjectURL(url);
    dialog.remove();
  };
  dialog.addEventListener("close", cleanup);
  dialog
    .querySelector("[data-close-pdf-preview]")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.showModal();
}
