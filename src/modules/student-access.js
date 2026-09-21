import { downloadWorkoutPdf } from "./workout-pdf.js";
import { openSecureCardForm } from "./mercado-pago-card.js";
import { findExerciseVideo } from "../data/library.js";

const TOKEN_KEY = "frs-student-token";
const CARD_PENDING_KEY = "frs-student-card-registration-pending";
const API_URL = import.meta.env.VITE_API_URL || "";
async function studentRequest(path, data) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  let response;
  try {
    response = await fetch(`${API_URL}/api/student/${path}`, {
      method: data ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
  } catch {
    throw new Error(
      "Não foi possível conectar ao serviço de contas. Tente novamente mais tarde.",
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      "O serviço de contas está indisponível. Tente novamente mais tarde.",
    );
  }
  if (!response.ok)
    throw new Error(result?.error || "Não foi possível acessar sua conta.");
  return result;
}
async function loadStudentExerciseVideo(id) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const response = await fetch(
    `${API_URL}/api/student/exercise-videos/${id}/file`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error || "Não foi possível carregar o vídeo.");
  }
  return URL.createObjectURL(await response.blob());
}
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
function article(title) {
  const card = element("article");
  card.append(element("h2", "", title));
  return card;
}
function addLine(parent, text, strong = false) {
  parent.append(element(strong ? "strong" : "p", "", text));
}
const billingCycleLabels = {
  monthly: "Plano mensal · 30 dias",
  quarterly: "Plano trimestral · 90 dias",
  semiannual: "Plano semestral · 180 dias",
  annual: "Plano anual · 365 dias",
  permanent: "Acesso permanente",
};
function billingCycleLabel(access) {
  return billingCycleLabels[access.billingCycle] || "";
}
function renderLocked(container, data) {
  const plan = article("Plano e acesso");
  addLine(plan, data.access.planName, true);
  if (billingCycleLabel(data.access))
    addLine(plan, billingCycleLabel(data.access));
  const messages = {
    pending: "Aguardando a confirmação do pagamento e a liberação do personal.",
    paused: "Seu acesso está pausado. Fale com o personal.",
    cancelled: "Seu acesso foi cancelado. Fale com o personal.",
  };
  addLine(plan, messages[data.access.status] || "Aguardando liberação.");
  container.replaceChildren(plan);
  [
    "Ficha de treino",
    "Exercícios",
    "Avaliação física",
    "Progresso",
    "Check-in semanal",
  ].forEach((title) => {
    const card = article(title);
    addLine(card, "Será liberado conforme o seu plano.");
    container.append(card);
  });
}

function matchingUploadedVideo(exercise, videos) {
  const normalized = (value) =>
    String(value || "")
      .trim()
      .toLocaleLowerCase("pt-BR");
  return videos.find(
    (video) =>
      String(video.id) === String(exercise.id || exercise.exerciseId) ||
      (normalized(video.name) === normalized(exercise.name) &&
        normalized(video.group) === normalized(exercise.group)),
  );
}

function appendExerciseMedia(parent, exercise, uploadedVideo) {
  if (uploadedVideo) {
    const media = element("section", "student-prescription-media");
    media.append(element("strong", "", "Vídeo demonstrativo"));
    const load = element(
      "button",
      "button button--secondary",
      "Assistir execução",
    );
    load.type = "button";
    load.addEventListener("click", async () => {
      load.disabled = true;
      load.textContent = "Carregando vídeo…";
      try {
        const video = element("video", "student-exercise-video");
        video.controls = true;
        video.preload = "metadata";
        video.playsInline = true;
        video.src = await loadStudentExerciseVideo(uploadedVideo.id);
        video.addEventListener(
          "loadedmetadata",
          () => video.play().catch(() => {}),
          { once: true },
        );
        media.append(video);
        load.remove();
      } catch (error) {
        load.disabled = false;
        load.textContent = error.message;
      }
    });
    media.append(load);
    parent.append(media);
    return;
  }
  const libraryVideo = findExerciseVideo(exercise);
  const mediaUrl = exercise.mediaUrl || libraryVideo?.videoUrl;
  const mediaType = exercise.mediaType || (libraryVideo ? "video" : "");
  if (!mediaUrl) {
    parent.append(
      element("span", "exercise-3d-pending", "Demonstração em preparação"),
    );
    return;
  }
  if (mediaType === "video") {
    const video = element("video", "student-exercise-video");
    video.controls = true;
    video.preload = "metadata";
    video.playsInline = true;
    video.src = mediaUrl;
    if (exercise.thumbnailUrl || libraryVideo?.posterUrl)
      video.poster = exercise.thumbnailUrl || libraryVideo.posterUrl;
    parent.append(video);
    return;
  }
  const media = element(
    "a",
    "",
    mediaType === "3d" ? "Abrir demonstração 3D" : "Abrir demonstração",
  );
  media.href = mediaUrl;
  media.target = "_blank";
  media.rel = "noreferrer";
  parent.append(media);
}

function appendExerciseGroups(parent, exercises, uploadedVideos = []) {
  const sessions = new Map();
  exercises.forEach((exercise) => {
    const session = exercise.sessionLabel || "A";
    if (!sessions.has(session)) sessions.set(session, []);
    sessions.get(session).push(exercise);
  });
  [...sessions.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([session, items]) => {
      const section = element("section", "student-muscle-group");
      const groups = [
        ...new Set(items.map((exercise) => exercise.group).filter(Boolean)),
      ];
      section.append(
        element("h3", "", `Treino ${session} — ${groups.join(" / ")}`),
      );
      const list = element("ol");
      items.forEach((exercise) => {
        const item = element("li");
        const prescription = `${exercise.sets} × ${exercise.repetitions}${exercise.restSeconds ? ` · descanso ${exercise.restSeconds}s` : ""}`;
        addLine(item, `${exercise.name} — ${prescription}`, true);
        addLine(
          item,
          exercise.instructions || "Siga a orientação do personal.",
        );
        appendExerciseMedia(
          item,
          exercise,
          matchingUploadedVideo(exercise, uploadedVideos),
        );
        list.append(item);
      });
      section.append(list);
      parent.append(section);
    });
}

function renderReadyWorkoutLibrary(container, data) {
  if (data.access.planCode !== "ready") return;
  const card = article("Meus Treinos Prontos");
  const workouts = data.readyWorkouts || [];
  if (!workouts.length) {
    addLine(
      card,
      "Os programas completos aparecerão aqui assim que forem publicados pelo personal.",
    );
  }
  workouts.forEach((workout) => {
    const block = element("section", "student-workout");
    addLine(block, workout.name, true);
    addLine(block, `${workout.goal} · ${workout.level} · ${workout.duration}`);
    if (workout.description) addLine(block, workout.description);
    const open = element(
      "button",
      "button button--secondary",
      "Baixar PDF completo",
    );
    open.type = "button";
    open.addEventListener("click", () =>
      downloadWorkoutPdf({ ...workout, readyProgram: true }, "Treino Pronto"),
    );
    block.append(open);
    appendExerciseGroups(
      block,
      workout.exercises || [],
      data.exerciseVideos || [],
    );
    card.append(block);
  });
  container.append(card);
}

function renderPortal(container, data) {
  const plan = article("Meu plano");
  addLine(plan, data.access.planName, true);
  if (billingCycleLabel(data.access))
    addLine(plan, billingCycleLabel(data.access));
  addLine(
    plan,
    data.access.accessType === "permanent"
      ? "Acesso permanente."
      : `Acesso até ${new Intl.DateTimeFormat("pt-BR").format(new Date(data.access.expiresAt))}.`,
  );
  container.replaceChildren(plan);
  renderReadyWorkoutLibrary(container, data);
  if (data.access.planCode !== "ready") {
    const workouts = article("Minha ficha personalizada");
    if (!data.workouts.length)
      addLine(workouts, "O personal ainda não publicou uma ficha para você.");
    data.workouts.forEach((workout) => {
      const workoutBlock = element("section", "student-workout");
      addLine(
        workoutBlock,
        `${workout.name} · ${workout.goal} · ${workout.duration}`,
        true,
      );
      const download = element(
        "button",
        "button button--secondary",
        "Baixar PDF personalizado",
      );
      download.type = "button";
      download.addEventListener("click", () =>
        downloadWorkoutPdf(workout, data.name),
      );
      workoutBlock.append(download);
      if (!workout.exercises.length)
        addLine(workoutBlock, "O personal ainda não adicionou exercícios.");
      if (!workout.exercises.length) {
        const library = element(
          "div",
          "exercise-3d-pending",
          "Biblioteca de animações 3D em preparação. Os exercícios aparecerão aqui quando forem cadastrados.",
        );
        workoutBlock.append(library);
      }
      appendExerciseGroups(
        workoutBlock,
        workout.exercises,
        data.exerciseVideos || [],
      );
      workouts.append(workoutBlock);
    });
    container.append(workouts);
  }
  if (data.access.features.includes("assessments")) {
    const assessmentCard = article("Avaliação física");
    if (!data.assessments.length)
      addLine(assessmentCard, "Nenhuma avaliação foi publicada.");
    data.assessments.forEach((a) =>
      addLine(
        assessmentCard,
        `${a.protocol} · ${new Intl.DateTimeFormat("pt-BR").format(new Date(a.assessedAt))} · ${a.weightKg} kg · IMC ${a.bmi || "—"} · gordura ${a.bodyFatPercent ?? "—"}%`,
      ),
    );
    container.append(assessmentCard);
  }
  if (data.access.features.includes("progress")) {
    const progress = article("Progresso");
    if (data.assessments.length < 2)
      addLine(progress, "O progresso aparecerá após a próxima reavaliação.");
    else {
      const latest = data.assessments[0],
        oldest = data.assessments.at(-1),
        change = (Number(latest.weightKg) - Number(oldest.weightKg)).toFixed(1);
      addLine(progress, `Variação de peso entre avaliações: ${change} kg.`);
    }
    container.append(progress);
  }
  if (data.access.features.includes("checkins")) {
    const checkin = article("Check-in semanal");
    const form = element("form");
    form.dataset.checkinForm = "";
    form.innerHTML = `<label class="field"><span>Energia (1 a 5)</span><input name="energy" type="number" min="1" max="5" required></label><label class="field"><span>Qualidade do sono (1 a 5)</span><input name="sleep" type="number" min="1" max="5" required></label><label class="field"><span>Dor ou desconforto</span><input name="pain" maxlength="200"></label><label class="field"><span>Como foi sua semana?</span><textarea name="notes" rows="3" maxlength="1000"></textarea></label><button class="button button--primary" type="submit">Enviar check-in</button><p role="status"></p>`;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = form.querySelector('[role="status"]');
      try {
        await studentRequest(
          "checkins",
          Object.fromEntries(new FormData(form)),
        );
        form.reset();
        status.textContent = "Check-in enviado ao personal.";
      } catch (error) {
        status.textContent = error.message;
      }
    });
    checkin.append(form);
    if (data.checkins.length)
      addLine(
        checkin,
        `Último envio: ${new Intl.DateTimeFormat("pt-BR").format(new Date(data.checkins[0].createdAt))}.`,
      );
    container.append(checkin);
  }
  const unavailable = [
    [
      "assessments",
      "Avaliação física",
      "Disponível a partir da Consultoria Básica.",
    ],
    ["progress", "Progresso", "Disponível a partir da Consultoria Básica."],
    ["checkins", "Check-in semanal", "Disponível nos planos Premium e Atleta."],
  ];
  unavailable
    .filter(([feature]) => !data.access.features.includes(feature))
    .forEach(([, title, message]) => {
      const locked = article(`🔒 ${title}`);
      locked.classList.add("student-feature-locked");
      addLine(locked, message);
      addLine(
        locked,
        "O recurso permanece visível para você conhecer as opções de evolução do plano.",
      );
      container.append(locked);
    });
}
function applyPlanFromHash() {
  const select = document.querySelector(
    '[data-student-form="register"] [name="planCode"]',
  );
  if (!select) return;
  const plan = new URLSearchParams(location.hash.split("?")[1] || "").get(
    "plan",
  );
  if ([...select.options].some((o) => o.value === plan)) {
    select.value = plan;
    select.dispatchEvent(new Event("change"));
  }
}
export function initStudentAccess() {
  let generation = 0;
  async function loadPanel() {
    applyPlanFromHash();
    const current = ++generation;
    if (location.hash.split("?")[0] !== "#painel-aluno") return;
    const status = document.querySelector("[data-student-panel-status]"),
      container = document.querySelector(".student-access-features");
    document.querySelector("[data-student-name]").textContent = "Área do Aluno";
    status.textContent = "Carregando seu acompanhamento…";
    if (!sessionStorage.getItem(TOKEN_KEY)) {
      location.hash = "#entrar-aluno";
      return;
    }
    try {
      const data = await studentRequest("me");
      if (current !== generation) return;
      if (!data.access.active && data.access.paymentStatus !== "paid") {
        location.hash = "#cadastro-aluno";
        const registrationStatus = document.querySelector(
          '[data-student-form="register"] [role="status"]',
        );
        if (registrationStatus)
          registrationStatus.textContent =
            "Seu pagamento ainda não foi confirmado. A conta e o painel só serão liberados após a aprovação.";
        return;
      }
      document.querySelector("[data-student-name]").textContent =
        `Olá, ${data.name}`;
      const paymentMessage = sessionStorage.getItem(
        "frs-student-payment-message",
      );
      if (paymentMessage) {
        sessionStorage.removeItem("frs-student-payment-message");
        status.textContent = `Sua conta foi criada. ${paymentMessage}`;
      } else {
        status.textContent = data.access.active
          ? "Seu acompanhamento está ativo e sincronizado com o personal."
          : data.access.paymentStatus === "pending"
            ? "Seu cadastro está aguardando liberação. A situação será atualizada automaticamente."
            : "Seu acompanhamento está aguardando liberação.";
      }
      if (data.access.active) renderPortal(container, data);
      else renderLocked(container, data);
    } catch (error) {
      if (current === generation) status.textContent = error.message;
    }
  }
  async function openRegisteredCardForm(form, status) {
    status.textContent = "Abrindo o formulário seguro do cartão…";
    try {
      await openSecureCardForm(studentRequest, {
        onApproved() {
          form.reset();
          delete form.dataset.studentRegistered;
          sessionStorage.removeItem(CARD_PENDING_KEY);
          sessionStorage.setItem(
            "frs-student-payment-message",
            "Pagamento confirmado. Seu cadastro foi concluído e o acesso está liberado.",
          );
          location.hash = "#painel-aluno";
          loadPanel();
        },
      });
      status.textContent =
        "Pagamento ainda não confirmado. Seu cadastro só será concluído após a aprovação do cartão.";
    } catch (error) {
      const localHint = ["localhost", "127.0.0.1"].includes(
        location.hostname,
      )
        ? " Para testar no computador, configure MERCADO_PAGO_ACCESS_TOKEN em backend/.dev.vars e reinicie o projeto."
        : "";
      status.textContent = `Seu pré-cadastro foi reservado, mas o formulário não pôde ser aberto. Nenhuma conta foi liberada. ${error.message}${localHint}`;
    }
  }
  document.querySelectorAll("[data-student-form]").forEach((form) => {
    if (
      form.dataset.studentForm === "register" &&
      sessionStorage.getItem(TOKEN_KEY) &&
      sessionStorage.getItem(CARD_PENDING_KEY)
    ) {
      form.dataset.studentRegistered = "true";
      form.querySelector('[type="submit"]').textContent =
        "Abrir formulário seguro";
    }
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const status = form.querySelector('[role="status"]'),
        button = form.querySelector('[type="submit"]'),
        label = button.textContent.trim();
      if (
        form.dataset.studentForm === "register" &&
        form.dataset.studentRegistered === "true"
      ) {
        button.disabled = true;
        await openRegisteredCardForm(form, status);
        button.disabled = false;
        button.textContent = "Abrir formulário seguro";
        return;
      }
      if (!form.reportValidity()) return;
      button.disabled = true;
      status.textContent = "Aguarde…";
      try {
        const data = Object.fromEntries(new FormData(form)),
          action = form.dataset.studentForm;
        if (
          action === "register" &&
          data.paymentChannel === "credit_card" &&
          sessionStorage.getItem(TOKEN_KEY)
        ) {
          const currentStudent = await studentRequest("me").catch(() => null);
          if (
            currentStudent?.email?.toLowerCase() === data.email.toLowerCase() &&
            currentStudent.access?.paymentStatus === "pending"
          ) {
            form.dataset.studentRegistered = "true";
            sessionStorage.setItem(CARD_PENDING_KEY, "true");
            await openRegisteredCardForm(form, status);
            return;
          }
        }
        if (action === "reset")
          data.token = new URLSearchParams(
            location.hash.split("?")[1] || "",
          ).get("token");
        const result = await studentRequest(`auth/${action}`, data);
        if (["forgot", "reset"].includes(action)) {
          form.reset();
          status.textContent = result.message;
          if (action === "reset") {
            sessionStorage.removeItem(TOKEN_KEY);
            history.replaceState(null, "", "#nova-senha");
          }
          return;
        }
        if (!result?.token)
          throw new Error("O servidor não retornou uma sessão válida.");
        sessionStorage.setItem(TOKEN_KEY, result.token);
        if (action === "login")
          sessionStorage.removeItem(CARD_PENDING_KEY);
        if (action === "register" && data.paymentChannel === "credit_card") {
          form.dataset.studentRegistered = "true";
          sessionStorage.setItem(CARD_PENDING_KEY, "true");
          await openRegisteredCardForm(form, status);
          return;
        }
        if (action === "register") {
          sessionStorage.removeItem(TOKEN_KEY);
          sessionStorage.removeItem(CARD_PENDING_KEY);
          status.textContent =
            "Pagamento ainda não confirmado. Seu cadastro será concluído somente depois que o PIX for confirmado pelo personal.";
          return;
        }
        form.reset();
        status.textContent = "";
        location.hash = "#painel-aluno";
      } catch (error) {
        status.textContent = error.message;
      } finally {
        button.disabled = false;
        button.textContent =
          form.dataset.studentRegistered === "true"
            ? "Abrir formulário seguro"
            : label;
      }
    });
  });
  document
    .querySelector("[data-student-logout]")
    .addEventListener("click", () => {
      generation++;
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(CARD_PENDING_KEY);
      document.querySelector("[data-student-name]").textContent =
        "Área do Aluno";
      location.hash = "#entrar-aluno";
    });
  window.addEventListener("hashchange", loadPanel);
  window.addEventListener("focus", loadPanel);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadPanel();
  });
  window.setInterval(() => {
    if (!document.hidden && location.hash.split("?")[0] === "#painel-aluno")
      loadPanel();
  }, 30000);
  loadPanel();
}
