(() => {
  "use strict";
  const slides = window.SLIDES || [];
  const stage = document.getElementById("stage");
  const counter = document.getElementById("counter");
  const slideTitle = document.getElementById("slideTitle");
  const mediaBtn = document.getElementById("mediaBtn");
  const jumpInput = document.getElementById("jumpInput");
  const thumbPanel = document.getElementById("thumbPanel");
  const thumbGrid = document.getElementById("thumbGrid");
  const teacherToolsPanel = document.getElementById("teacherToolsPanel");
  const teacherToolsBtn = document.getElementById("teacherToolsBtn");
  const studentScreenBlank = document.getElementById("studentScreenBlank");
  const state = { index: 0, paused: false, players: [], sequence: null, roadFrame: null, waveLabFrame: null };
  const toolState = { seconds: 300, presetSeconds: 300, interval: null, paused: false, tallies: { A: 0, B: 0, C: 0, D: 0 } };

  function quickResources() {
    const resources = [
      ["MATSEC Qs", "assets/pdf/MATSEC-Questions-Booklet-1.pdf"],
      ["Year 9", "assets/pdf/Year-9-Worksheets-2013.pdf"],
      ["Waves notes", "assets/pdf/Waves-Notes-Karen.pdf"],
      ["Syllabus", "assets/pdf/MATSEC-SEC24-Physics-2027.pdf"]
    ];
    return `<nav class="quick-resources" aria-label="Lesson resources">${resources.map(([label, href]) => `<a href="${href}" target="_blank" rel="noopener">${label}</a>`).join("")}</nav>`;
  }

  function sourceSlideIndex(number) {
    const n = Number(number);
    return slides.findIndex((slide) => slide.sourceSlide === n && !slide.activitySlide && !slide.lessonPlanSlide);
  }

  function hashIndex() {
    const match = location.hash.match(/#\/(\d+)(A)?/i);
    if (!match) return 0;
    const display = `${Number(match[1])}${match[2] ? "A" : ""}`;
    const exact = slides.findIndex((slide) => String(slide.displayNo || "") === display);
    if (exact >= 0) return exact;
    const source = sourceSlideIndex(Number(match[1]));
    return source >= 0 ? source : 0;
  }

  function stopCurrent() {
    if (state.sequence?.timer) clearTimeout(state.sequence.timer);
    if (state.roadFrame) cancelAnimationFrame(state.roadFrame);
    state.roadFrame = null;
    if (state.waveLabFrame) cancelAnimationFrame(state.waveLabFrame);
    state.waveLabFrame = null;
    state.sequence = null;
    stage.querySelectorAll("video").forEach((v) => v.pause());
    state.players.forEach((player) => {
      try { player.pause(); } catch (_) { /* Old SWFs may not expose pause. */ }
    });
    state.players = [];
    stage.querySelectorAll("[data-ripple-lab]").forEach((lab) => { if (lab._rippleFrame) cancelAnimationFrame(lab._rippleFrame); });
    stage.querySelectorAll("[data-frequency-lab]").forEach((lab) => { if (lab._freqFrame) cancelAnimationFrame(lab._freqFrame); });
    stage.querySelectorAll("[data-reflection-lab]").forEach((lab) => { if (lab._reflectFrame) cancelAnimationFrame(lab._reflectFrame); });
  }

  async function mountFlash() {
    const hosts = [...stage.querySelectorAll(".flash-host")];
    if (!hosts.length) return;
    if (!window.RufflePlayer?.newest) {
      hosts.forEach((host) => host.innerHTML = '<div class="flash-error">Ruffle could not load. Start the deck with the included launcher.</div>');
      return;
    }
    const ruffle = window.RufflePlayer.newest();
    hosts.forEach(async (host) => {
      const shell = host.closest(".media-shell");
      if (shell && !shell.querySelector(".flash-restart")) {
        const restart = document.createElement("button");
        restart.type = "button";
        restart.className = "flash-restart";
        restart.textContent = "↺ Restart";
        restart.title = "Restart this Flash animation from the beginning";
        restart.addEventListener("click", () => render(state.index, false));
        shell.appendChild(restart);
      }
      const player = ruffle.createPlayer();
      player.setAttribute("aria-label", "Interactive animation");
      host.appendChild(player);
      state.players.push(player);
      try {
        await player.load({
          url: host.dataset.swf,
          autoplay: "on",
          backgroundColor: "#ffffff",
          scale: host.dataset.scale || "showAll"
        });
        if (state.paused) {
          player.pause();
          const playOverlay = player.shadowRoot?.getElementById("play-button");
          if (playOverlay) playOverlay.style.display = "none";
        }
      } catch (error) {
        const note = document.createElement("div");
        note.className = "flash-error";
        note.textContent = "This legacy Flash item could not be emulated fully. Try the navigation or play controls inside the animation.";
        host.appendChild(note);
      }
    });
  }

  function mountSequence(config) {
    const image = stage.querySelector(".frame-sequence");
    if (!image || !config) return;
    const count = config.delays.length;
    const seq = state.sequence = { frame: 0, timer: null, image, config };
    const show = () => {
      image.src = `assets/${config.folder}/frame-${String(seq.frame).padStart(3, "0")}.png`;
      if (!state.paused) {
        seq.timer = setTimeout(() => {
          seq.frame = (seq.frame + 1) % count;
          show();
        }, config.delays[seq.frame]);
      }
    };
    seq.show = show;
    show();
  }

  function mountForceCards() {
    stage.querySelectorAll(".force-card").forEach((card) => {
      const run = () => {
        card.classList.remove("run");
        void card.offsetWidth;
        card.classList.add("run");
      };
      card.addEventListener("click", run);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          run();
        }
      });
    });
  }

  function mountVideoChoosers() {
    stage.querySelectorAll(".video-chooser").forEach((chooser) => {
      const video = chooser.querySelector(".choice-video");
      const title = chooser.querySelector(".video-choice-title");
      chooser.querySelectorAll(".video-option").forEach((button) => {
        button.addEventListener("click", () => {
          chooser.querySelectorAll(".video-option").forEach((item) => item.classList.remove("active"));
          button.classList.add("active");
          video.pause();
          video.src = button.dataset.src;
          const track = video.querySelector("track");
          if (track) track.src = button.dataset.track;
          title.textContent = button.dataset.title;
          video.load();
        });
      });
    });
  }

  function studentQuestionKey(kind, index) {
    const slide = window.SLIDES?.[state.index] || {};
    const lesson = window.STUDENT_LESSON || "all";
    const no = slide.displayNo || slide.sourceSlide || (state.index + 1);
    return `waves_student_response_l${lesson}_s${no}_${kind}_${index}`;
  }

  function studentNeedsDiagram(prompt) {
    return /\b(draw|sketch|plot|construct)\b|label(?:led)?\s+(?:wave|diagram|graph)|ray\s+diagram|wavefront\s+diagram/i.test(prompt || "");
  }

  function makeStudentResponse(prompt, kind, index) {
    const wrap = document.createElement("div");
    wrap.className = "student-answer-workspace";
    const label = document.createElement("label");
    label.className = "student-answer-label";
    label.textContent = "My answer";
    const area = document.createElement("textarea");
    area.className = "student-answer-input";
    area.rows = 5;
    area.placeholder = "Write your answer here. We will correct it together in class.";
    const key = studentQuestionKey(kind, index);
    try { area.value = localStorage.getItem(key) || ""; } catch (_) {}
    area.addEventListener("input", () => { try { localStorage.setItem(key, area.value); } catch (_) {} });
    wrap.append(label, area);

    if (studentNeedsDiagram(prompt)) {
      const upload = document.createElement("div");
      upload.className = "student-diagram-upload";
      upload.innerHTML = `<div><b>Diagram / graph answer</b><span>Upload a photo, screenshot or saved diagram.</span></div><label class="student-upload-button">＋ Upload diagram<input type="file" accept="image/*" hidden></label><div class="student-upload-preview" hidden><img alt="Uploaded diagram preview"><div><span class="student-upload-name"></span><button type="button" class="student-upload-remove">Remove</button></div></div>`;
      const input = upload.querySelector('input[type="file"]');
      const preview = upload.querySelector('.student-upload-preview');
      const img = upload.querySelector('img');
      const name = upload.querySelector('.student-upload-name');
      const remove = upload.querySelector('.student-upload-remove');
      const imageKey = key + "_diagram";
      const imageNameKey = key + "_diagram_name";
      try {
        const savedImage = localStorage.getItem(imageKey);
        if (savedImage) { img.src = savedImage; name.textContent = localStorage.getItem(imageNameKey) || "Saved diagram"; preview.hidden = false; }
      } catch (_) {}
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return;
        if (file.size > 1800000) { alert('Please use an image smaller than about 1.8 MB so it can save on this laptop.'); input.value=''; return; }
        const reader = new FileReader();
        reader.onload = () => {
          const data = String(reader.result || ''); img.src = data; name.textContent = file.name; preview.hidden = false;
          try { localStorage.setItem(imageKey, data); localStorage.setItem(imageNameKey, file.name); } catch (_) { alert('The diagram is shown, but this browser could not save it permanently.'); }
        };
        reader.readAsDataURL(file);
      });
      remove.addEventListener('click', () => { input.value=''; img.removeAttribute('src'); name.textContent=''; preview.hidden=true; try { localStorage.removeItem(imageKey); localStorage.removeItem(imageNameKey); } catch (_) {} });
      wrap.appendChild(upload);
    }
    const note = document.createElement("small");
    note.className = "student-save-note";
    note.textContent = "Your written answer saves automatically on this laptop.";
    wrap.appendChild(note);
    return wrap;
  }

  function mountStudentWorksheetQuestions(panel, questions) {
    questions.forEach((question, index) => {
      const promptNode = question.querySelector(":scope > span, :scope > p");
      const prompt = promptNode?.textContent || "";
      question.querySelector(".model-answer")?.remove();
      question.querySelector(".board-answer")?.remove();
      question.appendChild(makeStudentResponse(prompt, "checkpoint", index));
    });
    const nav = document.createElement("div");
    nav.className = "worksheet-question-nav student-question-nav";
    const tabs = questions.map((_, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "question-tab";
      button.textContent = questions.length > 4 ? `Q${index + 1}` : `Question ${index + 1}`;
      nav.appendChild(button);
      return button;
    });
    const reminder = document.createElement("span");
    reminder.className = "student-correct-reminder";
    reminder.textContent = "No answer reveal — we correct these together in class.";
    nav.appendChild(reminder);
    const grid = panel.querySelector(".worksheet-grid");
    panel.insertBefore(nav, grid);
    const show = (index) => {
      questions.forEach((question, i) => question.classList.toggle("active", i === index));
      tabs.forEach((tab, i) => tab.classList.toggle("active", i === index));
    };
    tabs.forEach((tab, index) => tab.addEventListener("click", () => show(index)));
    show(0);
  }

  function mountWorksheetQuestions() {
    const panel = stage.querySelector(".worksheet-panel");
    if (!panel) return;
    const questions = [...panel.querySelectorAll(".board-question")];
    if (!questions.length) return;
    if (window.STUDENT_EDITION) { mountStudentWorksheetQuestions(panel, questions); return; }
    questions.forEach((question) => {
      const model = question.querySelector(".model-answer");
      if (!model || model.querySelector(".answer-guide")) return;
      const prompt = (question.querySelector(":scope > span, :scope > p")?.textContent || question.textContent || "").toLowerCase();
      const slideTitleText = (stage.querySelector("h1")?.textContent || "").toLowerCase();
      const context = `${slideTitleText} ${prompt}`;
      let guide = null;
      if (/wave speed|wavelength|frequency|periodic|period|v = f|t = 1|calculate/.test(context)) {
        guide = "Write the known values with units. Choose T = 1/f, v = fλ or v = s/t. Rearrange before substituting if needed, then check the final unit.";
      } else if (/reflection|incident|reflected|normal|mirror/.test(context)) {
        guide = "Draw the normal first. Measure angles from the normal, not the surface. For reflection use i = r and add arrowheads to show ray direction.";
      } else if (/refraction|refractive|apparent depth|critical|internal reflection/.test(context)) {
        guide = "Identify the two media and the normal. Decide whether the wave speeds up or slows down, then state whether it bends towards or away from the normal. For TIR check both conditions.";
      } else if (/lens|magnification|focal|image/.test(context)) {
        guide = "Mark the principal axis, optical centre and F/2F first. Use two principal rays carefully, then describe image position, orientation, size and whether it is real or virtual.";
      } else if (/experiment|investigat|method|variable|fair test|practical/.test(context)) {
        guide = "Say what you will change, what you will measure and what must stay the same. Repeat each measurement, calculate a mean and identify one safety precaution before judging the result.";
      } else if (/area under|distance from.*velocity|velocity.*time.*distance/.test(context)) {
        guide = "Split the space under the velocity-time graph into simple shapes. Calculate each area, add them, and remember that velocity multiplied by time gives distance in metres.";
      } else if (/gradient.*acceleration|acceleration.*gradient/.test(context)) {
        guide = "Choose two clear points on the velocity-time line. Work out change in velocity over change in time. A rising line gives positive acceleration, a horizontal line gives zero, and a falling line gives deceleration.";
      } else if (/gradient.*speed|distance.time|journey graph/.test(context) && /speed|gradient/.test(prompt)) {
        guide = "Choose two points on the distance-time line. Find how much distance changes and divide by the matching time change. A steeper line means more distance is covered each second, so the speed is greater.";
      } else if (/plot|draw|sketch/.test(prompt)) {
        guide = "Read the axis labels first. Choose a scale that uses most of the graph, mark equal intervals, plot each coordinate carefully and join the points in time order. Then check that every section tells the stated motion story.";
      } else if (/average speed|average velocity|displacement/.test(context)) {
        guide = "For average speed use the whole distance travelled. For average velocity use the displacement from start to finish and include direction. In both cases divide by the total time.";
      } else if (/km\/h|kilomet/.test(context)) {
        guide = "Change kilometres to metres by multiplying by 1000, then change hours to seconds by multiplying by 3600. This is the same as dividing the km/h value by 3.6.";
      } else if (/stopping|thinking|braking|alcohol|wet road/.test(context)) {
        guide = "Separate the journey into thinking and braking. During thinking the speed stays constant; during braking it falls to zero. Driver factors change reaction time, while road, tyre and brake conditions change braking.";
      } else if (/suvat|free fall|uniform acceleration|final velocity|initial velocity/.test(context)) {
        guide = "Write s, u, v, a and t down the page. Fill in the known values with signs and units, mark the unknown, then choose the equation that avoids the one quantity you do not have.";
      } else if (/force|resultant|terminal|weight|air resistance/.test(context)) {
        guide = "Draw or imagine the forces as arrows. Compare their sizes to decide the resultant force; then use resultant force to decide whether the object accelerates, decelerates or continues at constant velocity.";
      } else if (/calculate|find|how long|how far|speed|acceleration|distance/.test(prompt)) {
        guide = "List the given values with units and state the unknown. Write the matching formula before inserting numbers, show the substitution as a fraction where needed, then check the unit and whether the answer is sensible.";
      }
      if (!guide) return;
      const box = document.createElement("p");
      box.className = "answer-guide";
      box.innerHTML = `<strong>How to think:</strong> ${guide}`;
      const solution = model.querySelector(".step-solution");
      model.insertBefore(box, solution || null);
    });
    const nav = document.createElement("div");
    nav.className = "worksheet-question-nav";
    const tabs = questions.map((_, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "question-tab";
      button.textContent = questions.length > 4 ? `Q${index + 1}` : `Question ${index + 1}`;
      nav.appendChild(button);
      return button;
    });
    const reveal = document.createElement("button");
    reveal.type = "button";
    reveal.className = "answer-reveal";
    reveal.textContent = "Reveal answer";
    nav.appendChild(reveal);
    const grid = panel.querySelector(".worksheet-grid");
    panel.insertBefore(nav, grid);
    let active = 0;
    const show = (index) => {
      active = index;
      questions.forEach((question, i) => {
        question.classList.toggle("active", i === index);
        question.classList.remove("revealed");
        question.querySelectorAll(".answer-step").forEach((step) => step.classList.remove("visible"));
        question.dataset.answerStep = "0";
        question.querySelectorAll("[data-model-points]").forEach((plot) => {
          plot.dataset.showModel = "false";
          plot.dataset.modelVisibleCount = "0";
          plot.dispatchEvent(new Event("modelplot"));
        });
      });
      tabs.forEach((tab, i) => tab.classList.toggle("active", i === index));
      reveal.classList.remove("showing");
      reveal.textContent = "Reveal answer";
    };
    tabs.forEach((tab, index) => tab.addEventListener("click", () => show(index)));
    reveal.addEventListener("click", () => {
      const visible = questions[active];
      const steps = [...visible.querySelectorAll(".answer-step")];
      if (steps.length) {
        visible.classList.add("revealed");
        const current = Number(visible.dataset.answerStep || 0);
        if (current < steps.length) {
          steps[current].classList.add("visible");
          visible.querySelectorAll("[data-model-points]").forEach((plot) => {
            const revealAt = Math.max(1, Number(plot.dataset.modelStep || 2));
            if (current + 1 >= revealAt) {
              plot.dataset.showModel = "true";
              if (plot.dataset.progressiveModel === "true") {
                const seriesCount = (plot.dataset.modelPoints || "").split("|").filter(Boolean).length;
                const baselineCount = Number(plot.dataset.modelBaselineCount || 0);
                plot.dataset.modelVisibleCount = String(Math.min(seriesCount, baselineCount + current + 2 - revealAt));
              }
              plot.dispatchEvent(new Event("modelplot"));
            }
          });
          visible.dataset.answerStep = String(current + 1);
          reveal.classList.add("showing", "step-mode");
          reveal.textContent = current + 1 < steps.length ? "Reveal next step" : "Hide answer";
        } else {
          visible.classList.remove("revealed");
          steps.forEach((step) => step.classList.remove("visible"));
          visible.dataset.answerStep = "0";
          visible.querySelectorAll("[data-model-points]").forEach((plot) => {
            plot.dataset.showModel = "false";
            plot.dataset.modelVisibleCount = "0";
            plot.dispatchEvent(new Event("modelplot"));
          });
          reveal.classList.remove("showing", "step-mode");
          reveal.textContent = "Reveal answer";
        }
        return;
      }
      const showing = visible.classList.toggle("revealed");
      reveal.classList.toggle("showing", showing);
      reveal.textContent = showing ? "Hide answer" : "Reveal answer";
    });
    show(0);
  }

  function mountRevealSequences() {
    stage.querySelectorAll(".reveal-sequence").forEach((sequence) => {
      const steps = [...sequence.querySelectorAll(".reveal-step")];
      const button = sequence.querySelector(".reveal-next") || sequence.parentElement?.querySelector(":scope > .reveal-next");
      if (!button || !steps.length) return;
      let shown = 0;
      steps.forEach((step) => step.classList.remove("shown"));
      button.addEventListener("click", () => {
        if (shown < steps.length) {
          steps[shown].classList.add("shown");
          shown += 1;
        } else {
          steps.forEach((step) => step.classList.remove("shown"));
          shown = 0;
        }
        button.textContent = shown < steps.length ? "Reveal next stage" : "Reset stages";
      });
    });
  }

  function mountLessonLinks() {
    stage.querySelectorAll("[data-lesson-target]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const index = slides.findIndex((slide) => slide.lessonId === link.dataset.lessonTarget);
        if (index >= 0) render(index);
      });
    });
    stage.querySelectorAll("[data-slide-target]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const slideNumber = Number(link.dataset.slideTarget);
        if (Number.isFinite(slideNumber)) {
          const index = sourceSlideIndex(slideNumber);
          if (index >= 0) render(index);
        }
      });
    });
  }

  function mountGradientDemos() {
    stage.querySelectorAll("[data-gradient-demo]").forEach((demo) => {
      const line = demo.querySelector(".gradient-main");
      const triangle = demo.querySelector(".gradient-triangle");
      const readout = demo.querySelector(".gradient-value");
      const settings = {
        gentle: { line: "M80 295L540 220", triangle: "M170 280H460V233", text: "Gentle gradient: lower speed" },
        medium: { line: "M80 295L540 145", triangle: "M170 266H460V171", text: "Medium gradient: medium speed" },
        steep: { line: "M80 295L540 60", triangle: "M170 248H460V93", text: "Steep gradient: higher speed" }
      };
      demo.querySelectorAll("[data-gradient]").forEach((button) => {
        button.addEventListener("click", () => {
          const setting = settings[button.dataset.gradient];
          if (!setting) return;
          line.setAttribute("d", setting.line);
          triangle.setAttribute("d", setting.triangle);
          readout.textContent = setting.text;
          demo.querySelectorAll("[data-gradient]").forEach((item) => item.classList.toggle("active", item === button));
        });
      });
    });
  }

  function mountCarRoads() {
    stage.querySelectorAll("[data-car-road]").forEach((road) => {
      const start = stage.querySelector("[data-car-start]");
      const reset = stage.querySelector("[data-car-reset]");
      const speed = road.querySelector("[data-road-speed]");
      const time = road.querySelector("[data-road-time]");
      const distance = road.querySelector("[data-road-distance]");
      const phase = road.querySelector("[data-road-phase]");
      const setReadouts = (seconds = 0, metres = 0, metresPerSecond = 20, label = "Ready") => {
        if (speed) speed.textContent = `${metresPerSecond.toFixed(1)} m/s`;
        if (time) time.textContent = `${seconds.toFixed(2)} s`;
        if (distance) distance.textContent = `${metres.toFixed(1)} m`;
        if (phase) phase.textContent = label;
      };
      const run = () => {
        if (state.roadFrame) cancelAnimationFrame(state.roadFrame);
        road.classList.remove("run");
        void road.offsetWidth;
        road.classList.add("run");
        const began = performance.now();
        const thinkingTime = 0.75;
        const brakingTime = 2.45;
        const initialSpeed = 20;
        const frame = (now) => {
          const elapsed = Math.min((now - began) / 1000, thinkingTime + brakingTime);
          let currentSpeed = initialSpeed;
          let travelled = initialSpeed * elapsed;
          let label = "THINKING: constant velocity";
          if (elapsed > thinkingTime) {
            const brakingElapsed = elapsed - thinkingTime;
            currentSpeed = initialSpeed * Math.max(0, 1 - brakingElapsed / brakingTime);
            travelled = initialSpeed * thinkingTime + initialSpeed * brakingElapsed - (initialSpeed / (2 * brakingTime)) * brakingElapsed * brakingElapsed;
            label = currentSpeed > 0 ? "BRAKING: velocity decreasing" : "STOPPED";
          }
          setReadouts(elapsed, travelled, currentSpeed, label);
          if (elapsed < thinkingTime + brakingTime) state.roadFrame = requestAnimationFrame(frame);
          else state.roadFrame = null;
        };
        state.roadFrame = requestAnimationFrame(frame);
      };
      if (start) start.addEventListener("click", run);
      if (reset) reset.addEventListener("click", () => {
        if (state.roadFrame) cancelAnimationFrame(state.roadFrame);
        state.roadFrame = null;
        road.classList.remove("run");
        setReadouts();
      });
      setReadouts();
    });
  }

  function mountRulerLabs() {
    stage.querySelectorAll("[data-ruler-stage]").forEach((lab) => {
      const drop = stage.querySelector("[data-ruler-drop]");
      const reset = stage.querySelector("[data-ruler-reset]");
      const run = () => {
        lab.classList.remove("drop");
        void lab.offsetWidth;
        lab.classList.add("drop");
      };
      if (drop) drop.addEventListener("click", run);
      if (reset) reset.addEventListener("click", () => lab.classList.remove("drop"));
    });
  }

  function mountPlotters() {
    stage.querySelectorAll("[data-plotter-panel]").forEach((panel) => {
      const canvas = panel.querySelector("canvas");
      if (!canvas) return;
      const context = canvas.getContext("2d");
      const points = [];
      let drawing = false;
      const join = panel.querySelector("[data-plot-join]");
      const draw = () => {
        const width = canvas.width;
        const height = canvas.height;
        const left = 75, right = width - 30, top = 25, bottom = height - 58;
        context.clearRect(0, 0, width, height);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.strokeStyle = "#dce9ef";
        context.lineWidth = 1;
        for (let i = 0; i <= 10; i += 1) {
          const x = left + (right - left) * i / 10;
          const y = top + (bottom - top) * i / 10;
          context.beginPath(); context.moveTo(x, top); context.lineTo(x, bottom); context.stroke();
          context.beginPath(); context.moveTo(left, y); context.lineTo(right, y); context.stroke();
        }
        context.strokeStyle = "#17354a";
        context.lineWidth = 4;
        context.beginPath(); context.moveTo(left, top); context.lineTo(left, bottom); context.lineTo(right, bottom); context.stroke();
        context.fillStyle = "#17354a";
        context.font = "bold 22px system-ui, sans-serif";
        context.fillText("vertical variable", 8, 20);
        context.fillText("horizontal variable", right - 210, height - 14);
        if (join?.checked && points.length > 1) {
          context.strokeStyle = "#168db4";
          context.lineWidth = 5;
          context.beginPath();
          points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
          context.stroke();
        }
        points.forEach((point) => {
          context.beginPath(); context.arc(point.x, point.y, 7, 0, Math.PI * 2);
          context.fillStyle = "#e64b72"; context.fill();
          context.strokeStyle = "#ffffff"; context.lineWidth = 2; context.stroke();
        });
      };
      const addPoint = (event) => {
        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * canvas.width / rect.width;
        const y = (event.clientY - rect.top) * canvas.height / rect.height;
        if (x < 75 || x > canvas.width - 30 || y < 25 || y > canvas.height - 58) return;
        const previous = points[points.length - 1];
        if (!previous || Math.hypot(previous.x - x, previous.y - y) > 18) points.push({ x, y });
        draw();
      };
      panel.closest(".slide")?.querySelectorAll("[data-plot-toggle]").forEach((button) => button.addEventListener("click", () => {
        panel.classList.add("open");
        draw();
      }));
      panel.querySelector("[data-plot-close]")?.addEventListener("click", () => panel.classList.remove("open"));
      panel.querySelector("[data-plot-clear]")?.addEventListener("click", () => { points.length = 0; draw(); });
      panel.querySelector("[data-plot-undo]")?.addEventListener("click", () => { points.pop(); draw(); });
      join?.addEventListener("change", draw);
      canvas.addEventListener("pointerdown", (event) => { drawing = true; canvas.setPointerCapture(event.pointerId); addPoint(event); });
      canvas.addEventListener("pointermove", (event) => { if (drawing) addPoint(event); });
      canvas.addEventListener("pointerup", () => { drawing = false; });
      canvas.addEventListener("pointercancel", () => { drawing = false; });
      draw();
    });
  }

  function mountTeacherQAs() {
    stage.querySelectorAll("[data-teacher-qa]").forEach((item) => {
      item.querySelector("button")?.addEventListener("click", () => {
        const panel = item.closest(".teacher-qa");
        panel?.querySelectorAll("[data-teacher-qa]").forEach((other) => {
          if (other !== item) other.classList.remove("open");
        });
        item.classList.toggle("open");
      });
    });
  }

  function mountInlinePlots() {
    stage.querySelectorAll("[data-inline-plot]").forEach((plot) => {
      const canvas = plot.querySelector("canvas");
      if (!canvas) return;
      const context = canvas.getContext("2d");
      const maxX = Number(plot.dataset.maxX || 10);
      const maxY = Number(plot.dataset.maxY || 10);
      const xStep = Number(plot.dataset.xStep || maxX / 5);
      const yStep = Number(plot.dataset.yStep || maxY / 5);
      const points = [];
      const modelSeries = (plot.dataset.modelPoints || "").split("|").map((series) => series.split(";").filter(Boolean).map((pair) => pair.split(",").map(Number))).filter((series) => series.length > 1);
      const modelColors = (plot.dataset.modelColors || "").split("|").filter(Boolean);
      const modelLabels = (plot.dataset.modelLabels || "").split("|");
      let drawing = false;
      const left = 62, right = canvas.width - 25, top = 18, bottom = canvas.height - 55;
      const format = (value) => String(Math.round(value * 100) / 100);
      const draw = () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.strokeStyle = "#d8e7ee";
        context.lineWidth = 1;
        for (let value = 0; value <= maxX + xStep / 10; value += xStep) {
          const x = left + (right - left) * value / maxX;
          context.beginPath(); context.moveTo(x, top); context.lineTo(x, bottom); context.stroke();
        }
        for (let value = 0; value <= maxY + yStep / 10; value += yStep) {
          const y = bottom - (bottom - top) * value / maxY;
          context.beginPath(); context.moveTo(left, y); context.lineTo(right, y); context.stroke();
        }
        context.strokeStyle = "#17354a";
        context.lineWidth = 3;
        context.beginPath(); context.moveTo(left, top); context.lineTo(left, bottom); context.lineTo(right, bottom); context.stroke();
        context.fillStyle = "#17354a";
        context.font = "bold 15px Arial, sans-serif";
        context.textAlign = "center";
        for (let value = 0; value <= maxX + xStep / 10; value += xStep) {
          const x = left + (right - left) * value / maxX;
          context.fillText(format(value), x, bottom + 20);
        }
        context.textAlign = "right";
        for (let value = yStep; value <= maxY + yStep / 10; value += yStep) {
          const y = bottom - (bottom - top) * value / maxY;
          context.fillText(format(value), left - 8, y + 5);
        }
        context.font = "bold 16px Arial, sans-serif";
        context.textAlign = "right";
        context.fillText(plot.dataset.xLabel || "x", right, canvas.height - 10);
        context.save();
        context.translate(16, top);
        context.rotate(-Math.PI / 2);
        context.textAlign = "right";
        context.fillText(plot.dataset.yLabel || "y", 0, 0);
        context.restore();
        if (points.length > 1) {
          context.strokeStyle = "#168db4";
          context.lineWidth = 4;
          context.beginPath();
          points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
          context.stroke();
        }
        points.forEach((point) => {
          context.beginPath(); context.arc(point.x, point.y, 6, 0, Math.PI * 2);
          context.fillStyle = "#e64b72"; context.fill();
          context.strokeStyle = "#ffffff"; context.lineWidth = 2; context.stroke();
        });
        const baselineCount = Number(plot.dataset.modelBaselineCount || 0);
        const requestedCount = Number(plot.dataset.modelVisibleCount || 0);
        const visibleCount = plot.dataset.showModel === "true"
          ? (plot.dataset.progressiveModel === "true" ? Math.max(baselineCount, requestedCount) : modelSeries.length)
          : baselineCount;
        if (visibleCount > 0 && modelSeries.length) {
          const visibleSeries = modelSeries.slice(0, visibleCount);
          visibleSeries.forEach((modelPoints, seriesIndex) => {
            const colour = modelColors[seriesIndex] || "#087a51";
            context.strokeStyle = colour;
            context.lineWidth = seriesIndex ? 5 : 6;
            context.beginPath();
            modelPoints.forEach(([valueX, valueY], index) => {
              const x = left + (right - left) * valueX / maxX;
              const y = bottom - (bottom - top) * valueY / maxY;
              if (index) context.lineTo(x, y); else context.moveTo(x, y);
            });
            context.stroke();
          });
          visibleSeries.forEach((modelPoints, seriesIndex) => modelPoints.forEach(([valueX, valueY]) => {
            const x = left + (right - left) * valueX / maxX;
            const y = bottom - (bottom - top) * valueY / maxY;
            context.beginPath(); context.arc(x, y, 5, 0, Math.PI * 2);
              context.fillStyle = modelColors[seriesIndex] || "#087a51"; context.fill();
              context.strokeStyle = "#ffffff"; context.lineWidth = 2; context.stroke();
          }));
          context.font = "bold 16px Arial, sans-serif";
          context.textAlign = "left";
          visibleSeries.forEach((_, seriesIndex) => {
            const colour = modelColors[seriesIndex] || "#087a51";
            const label = modelLabels[seriesIndex] || (modelSeries.length > 1 ? `Graph ${seriesIndex + 1}` : "MODEL LINE");
            const legendY = top + 18 + seriesIndex * 23;
            context.strokeStyle = colour;
            context.lineWidth = 5;
            context.beginPath(); context.moveTo(right - 235, legendY - 5); context.lineTo(right - 197, legendY - 5); context.stroke();
            context.fillStyle = colour;
            context.fillText(label, right - 188, legendY);
          });
        }
      };
      const addPoint = (event) => {
        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * canvas.width / rect.width;
        const y = (event.clientY - rect.top) * canvas.height / rect.height;
        if (x < left || x > right || y < top || y > bottom) return;
        const previous = points[points.length - 1];
        if (!previous || Math.hypot(previous.x - x, previous.y - y) > 16) points.push({ x, y });
        draw();
      };
      plot.querySelector("[data-inline-clear]")?.addEventListener("click", () => { points.length = 0; draw(); });
      plot.querySelector("[data-inline-undo]")?.addEventListener("click", () => { points.pop(); draw(); });
      canvas.addEventListener("pointerdown", (event) => { drawing = true; canvas.setPointerCapture(event.pointerId); addPoint(event); });
      canvas.addEventListener("pointermove", (event) => { if (drawing) addPoint(event); });
      canvas.addEventListener("pointerup", () => { drawing = false; });
      canvas.addEventListener("pointercancel", () => { drawing = false; });
      plot.addEventListener("modelplot", draw);
      draw();
    });
  }

  function mountTerminalVelocity() {
    stage.querySelectorAll("[data-terminal-demo]").forEach((demo) => {
      const start = demo.querySelector("[data-terminal-start]");
      const reset = demo.querySelector("[data-terminal-reset]");
      let timers = [];
      const clear = () => { timers.forEach(clearTimeout); timers = []; };
      const setStage = (name) => {
        demo.classList.remove("stage-start", "stage-building", "stage-terminal");
        demo.classList.add(name);
      };
      const run = () => {
        clear();
        setStage("stage-start");
        void demo.offsetWidth;
        timers.push(setTimeout(() => setStage("stage-building"), 900));
        timers.push(setTimeout(() => setStage("stage-terminal"), 3400));
      };
      start?.addEventListener("click", run);
      reset?.addEventListener("click", () => { clear(); setStage("stage-start"); });
      setStage("stage-start");
    });
  }

  function mountStoppingScenarioDemos() {
    stage.querySelectorAll("[data-stopping-scenario]").forEach((demo) => {
      const canvas = demo.querySelector("[data-stop-graph]");
      if (!canvas) return;
      const context = canvas.getContext("2d");
      const car = demo.querySelector("[data-stop-car]");
      const speedLabel = demo.querySelector("[data-stop-speed]");
      const timeLabel = demo.querySelector("[data-stop-time]");
      const distanceLabel = demo.querySelector("[data-stop-distance]");
      const phaseLabel = demo.querySelector("[data-stop-phase]");
      const effectLabel = demo.querySelector("[data-stop-effect]");
      const startButton = demo.querySelector("[data-stop-start]");
      const resetButton = demo.querySelector("[data-stop-reset]");
      const choices = [...demo.querySelectorAll("[data-stop-choice]")];
      const scenarios = {
        normal: { reaction: .6, braking: 2, colour: "#087a51", label: "Normal", effect: "Normal reaction time and normal braking on a dry road." },
        alcohol: { reaction: 1.2, braking: 2, colour: "#d87800", label: "Alcohol", effect: "Alcohol increases reaction time, so thinking distance becomes longer. In this model the road and brakes are unchanged." },
        wet: { reaction: .6, braking: 3.4, colour: "#9a3fbd", label: "Wet road", effect: "The driver's reaction is unchanged, but reduced grip makes braking gentler and braking distance longer." }
      };
      let selected = "normal";
      let frame = 0;
      let running = false;
      const v0 = 20;
      const totalTime = (scenario) => scenario.reaction + scenario.braking;
      const velocityAt = (scenario, time) => time <= scenario.reaction ? v0 : Math.max(0, v0 * (1 - (time - scenario.reaction) / scenario.braking));
      const distanceAt = (scenario, time) => {
        if (time <= scenario.reaction) return v0 * time;
        const brakingTime = Math.min(scenario.braking, time - scenario.reaction);
        return v0 * scenario.reaction + v0 * brakingTime - .5 * (v0 / scenario.braking) * brakingTime * brakingTime;
      };
      const drawCurve = (scenario, upto, colour, width, alpha = 1) => {
        const left = 66, right = canvas.width - 28, top = 25, bottom = canvas.height - 58;
        const maxTime = 4.5, maxVelocity = 22;
        context.save(); context.globalAlpha = alpha; context.strokeStyle = colour; context.lineWidth = width; context.beginPath();
        const end = Math.min(upto, totalTime(scenario));
        for (let time = 0; time <= end + .001; time += .025) {
          const x = left + (right - left) * time / maxTime;
          const y = bottom - (bottom - top) * velocityAt(scenario, time) / maxVelocity;
          if (time === 0) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.stroke(); context.restore();
      };
      const drawGraph = (time = 0) => {
        const left = 66, right = canvas.width - 28, top = 25, bottom = canvas.height - 58;
        context.clearRect(0, 0, canvas.width, canvas.height); context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
        context.strokeStyle = "#d7e7ee"; context.lineWidth = 1;
        for (let xValue = 0; xValue <= 4.5; xValue += .5) { const x = left + (right-left)*xValue/4.5; context.beginPath(); context.moveTo(x,top); context.lineTo(x,bottom); context.stroke(); }
        for (let yValue = 0; yValue <= 20; yValue += 5) { const y = bottom-(bottom-top)*yValue/22; context.beginPath(); context.moveTo(left,y); context.lineTo(right,y); context.stroke(); }
        context.strokeStyle="#17354a"; context.lineWidth=3; context.beginPath(); context.moveTo(left,top); context.lineTo(left,bottom); context.lineTo(right,bottom); context.stroke();
        context.fillStyle="#17354a"; context.font="bold 16px Arial"; context.textAlign="center";
        for(let xValue=0;xValue<=4.5;xValue+=.5){const x=left+(right-left)*xValue/4.5;context.fillText(String(xValue),x,bottom+22);}
        context.textAlign="right"; for(let yValue=0;yValue<=20;yValue+=5){const y=bottom-(bottom-top)*yValue/22;context.fillText(String(yValue),left-9,y+5);}
        context.font="bold 18px Arial"; context.fillText("time / s",right,canvas.height-10); context.save(); context.translate(19,top); context.rotate(-Math.PI/2); context.textAlign="right"; context.fillText("velocity / m s⁻¹",0,0); context.restore();
        if(selected!=="normal") drawCurve(scenarios.normal,totalTime(scenarios.normal),"#91a7b4",4,.65);
        drawCurve(scenarios[selected],time,scenarios[selected].colour,7,1);
        context.fillStyle=scenarios[selected].colour; context.textAlign="left"; context.font="bold 18px Arial"; context.fillText(scenarios[selected].label,right-145,top+20);
      };
      const reset = () => {
        cancelAnimationFrame(frame); running=false; startButton.disabled=false;
        speedLabel.textContent="20.0 m/s"; timeLabel.textContent="0.00 s"; distanceLabel.textContent="0.0 m";
        phaseLabel.textContent="Ready: velocity is constant during thinking time."; effectLabel.textContent=scenarios[selected].effect;
        car.style.left="4%"; drawGraph(0);
      };
      const run = () => {
        if(running) return; reset(); running=true; startButton.disabled=true; const scenario=scenarios[selected]; const started=performance.now(); const duration=totalTime(scenario);
        const tick = (now) => {
          if(!demo.isConnected) return;
          const time=Math.min(duration,(now-started)/1000); const velocity=velocityAt(scenario,time); const distance=distanceAt(scenario,time); const totalDistance=distanceAt(scenario,duration);
          speedLabel.textContent=`${velocity.toFixed(1)} m/s`; timeLabel.textContent=`${time.toFixed(2)} s`; distanceLabel.textContent=`${distance.toFixed(1)} m`;
          car.style.left=`${4+74*distance/totalDistance}%`;
          phaseLabel.textContent=time<scenario.reaction?"THINKING: velocity stays constant; distance still increases.":velocity>0?"BRAKING: velocity decreases; the graph slopes down.":"STOPPED: velocity is zero.";
          drawGraph(time);
          if(time<duration) frame=requestAnimationFrame(tick); else {running=false;startButton.disabled=false;}
        };
        frame=requestAnimationFrame(tick);
      };
      choices.forEach((button)=>button.addEventListener("click",()=>{selected=button.dataset.stopChoice;choices.forEach((item)=>item.classList.toggle("active",item===button));reset();}));
      startButton?.addEventListener("click",run); resetButton?.addEventListener("click",reset); reset();
    });
  }

  function mountAverageJourney() {
    stage.querySelectorAll("[data-average-demo]").forEach((demo) => {
      let mode = "one", timer = null;
      const runner = demo.querySelector(".v15-demo-runner");
      const fields = {
        time: demo.querySelector("[data-time]"), distance: demo.querySelector("[data-distance]"),
        displacement: demo.querySelector("[data-displacement]"), speed: demo.querySelector("[data-speed]"), velocity: demo.querySelector("[data-velocity]")
      };
      const reset = () => {
        clearInterval(timer); timer = null; runner.style.left = "3%";
        fields.time.textContent = "0 s"; fields.distance.textContent = "0 m"; fields.displacement.textContent = "0 m east";
        fields.speed.textContent = "—"; fields.velocity.textContent = "—";
      };
      const run = () => {
        reset(); const duration = mode === "one" ? 10 : 20; const started = performance.now();
        timer = setInterval(() => {
          const elapsed = Math.min(duration, (performance.now() - started) / 350);
          const outward = Math.min(10, elapsed); const returning = Math.max(0, elapsed - 10);
          const position = mode === "one" ? outward * 10 : (returning ? (10 - returning) * 10 : outward * 10);
          const distance = elapsed * 10; const displacement = Math.max(0, position);
          runner.style.left = `${3 + .9 * position}%`;
          fields.time.textContent = `${elapsed.toFixed(1)} s`; fields.distance.textContent = `${distance.toFixed(0)} m`;
          fields.displacement.textContent = `${displacement.toFixed(0)} m east`;
          fields.speed.textContent = `${(distance / Math.max(elapsed, .1)).toFixed(1)} m/s`;
          fields.velocity.textContent = `${(displacement / Math.max(elapsed, .1)).toFixed(1)} m/s east`;
          if (elapsed >= duration) clearInterval(timer);
        }, 35);
      };
      demo.querySelectorAll("[data-journey]").forEach(button => button.addEventListener("click", () => {
        mode = button.dataset.journey; demo.querySelectorAll("[data-journey]").forEach(b => b.classList.toggle("active", b === button)); reset();
      }));
      demo.querySelector("[data-journey-start]")?.addEventListener("click", run);
      demo.querySelector("[data-journey-reset]")?.addEventListener("click", reset);
      demo.querySelector('[data-journey="one"]')?.classList.add("active"); reset();
    });
  }

  function syncMediaButton(slide) {
    mediaBtn.classList.toggle("visible", Boolean(slide.pauseable));
    mediaBtn.classList.toggle("playing", state.paused);
    mediaBtn.innerHTML = state.paused ? "▶ <span>Resume</span>" : "⏸ <span>Pause</span>";
    mediaBtn.title = state.paused ? "Resume animation (P)" : "Pause animation (P)";
  }

  function formatToolTime(seconds) {
    const safe = Math.max(0, seconds);
    return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
  }

  function updateToolTimer() {
    const display = document.getElementById("toolTimerDisplay");
    if (display) display.textContent = formatToolTime(toolState.seconds);
    document.body.classList.toggle("tool-timer-finished", toolState.seconds === 0);
  }

  function startToolTimer(minutes) {
    clearInterval(toolState.interval);
    toolState.presetSeconds = Math.max(1, Math.round(Number(minutes) * 60));
    toolState.seconds = toolState.presetSeconds;
    toolState.paused = false;
    document.getElementById("toolTimerPause").textContent = "Pause";
    updateToolTimer();
    toolState.interval = setInterval(() => {
      if (toolState.paused || toolState.seconds <= 0) return;
      toolState.seconds -= 1;
      updateToolTimer();
      if (toolState.seconds === 0) {
        clearInterval(toolState.interval);
        playAttentionSound(true);
      }
    }, 1000);
  }

  function playAttentionSound(finished = false) {
    try {
      const audio = new (window.AudioContext || window.webkitAudioContext)();
      const notes = finished ? [660, 880, 1040] : [880, 660];
      notes.forEach((frequency, index) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.frequency.value = frequency;
        oscillator.type = "sine";
        gain.gain.setValueAtTime(.0001, audio.currentTime + index * .18);
        gain.gain.exponentialRampToValueAtTime(.18, audio.currentTime + index * .18 + .02);
        gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + index * .18 + .16);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start(audio.currentTime + index * .18);
        oscillator.stop(audio.currentTime + index * .18 + .18);
      });
      setTimeout(() => audio.close(), 900);
    } catch (_) { /* Sound can be blocked by browser settings. */ }
  }

  const activityAnchors = {7:"a1",15:"a2",22:"a3",31:"a4",41:"a5",48:"a6",54:"a7",61:"a8",65:"a9",67:"a10",66:"a11",77:"a12",83:"a13",87:"a14",102:"a15",110:"a16",112:"a17",120:"a18",134:"a19",138:"a20",19:"a21",39:"a22",40:"a23",46:"a24",78:"a25"};

  function studentSheetTarget(slideNumber) {
    if (activityAnchors[slideNumber]) return `STUDENT_ACTIVITIES.html#${activityAnchors[slideNumber]}`;
    if (slideNumber <= 21) return "STUDENT_WORKBOOK.html#wave-basics";
    if (slideNumber <= 32) return "STUDENT_WORKBOOK.html#equations";
    if (slideNumber <= 63) return "STUDENT_WORKBOOK.html#ripple-tank";
    if (slideNumber <= 85) return "STUDENT_WORKBOOK.html#sound";
    if (slideNumber <= 121) return "STUDENT_WORKBOOK.html#em-light";
    if (slideNumber <= 137) return "STUDENT_WORKBOOK.html#lenses";
    return "ASSESSMENT_BOOK.html#final";
  }

  function teacherBookTarget(slideNumber) {
    const activityAnchor = activityAnchors[slideNumber];
    if (activityAnchor) return `TEACHER_ACTIVITY_GUIDE.html?fromSlide=${slideNumber}#teacher-${activityAnchor}`;
    if (slideNumber >= 139) return `TEACHER_ACTIVITY_GUIDE.html?fromSlide=${slideNumber}#assessment-use`;
    return `TEACHER_ACTIVITY_GUIDE.html?fromSlide=${slideNumber}#critical-thinking`;
  }

  function slideResourceTabs(slideNumber) {
    const studentBase = studentSheetTarget(slideNumber);
    const joiner = studentBase.includes("#") ? studentBase.replace("#", `?fromSlide=${slideNumber}#`) : `${studentBase}?fromSlide=${slideNumber}`;
    const studentHref = joiner;
    const teacherHref = teacherBookTarget(slideNumber);
    return `<nav class="slide-resource-tabs" aria-label="Books for slide ${slideNumber}"><a class="student-book-tab" href="${studentHref}" target="_blank" rel="noopener">📘 Student Book <span class="book-slide">S${slideNumber}</span></a><a class="pdf-resource-tab" href="STUDENT_SHEETS_COMPLETE.pdf" target="_blank" rel="noopener" title="Complete printable student book PDF">PDF</a><a class="teacher-book-tab" href="${teacherHref}" target="_blank" rel="noopener">📙 Teacher Book <span class="book-slide">S${slideNumber}</span></a><a class="pdf-resource-tab teacher-pdf" href="TEACHER_TOOLS_COMPLETE.pdf" target="_blank" rel="noopener" title="Complete printable teacher book PDF">PDF</a><button type="button" data-open-teacher-tools title="Open live teacher tools">🧰 Tools</button></nav>`;
  }

  function mountSlideResourceTabs() {
    stage.querySelectorAll("[data-open-teacher-tools]").forEach((button) => button.addEventListener("click", () => {
      teacherToolsPanel.classList.add("open");
      const currentTab = teacherToolsPanel.querySelector('[data-tool-tab="current"]');
      currentTab?.click();
    }));
  }

  function mountWaveLabs() {
    const labs = [...stage.querySelectorAll("[data-wave-lab]")];
    if (!labs.length) return;
    const ns = "http://www.w3.org/2000/svg";

    const setLine = (el,x1,y1,x2,y2) => { if (!el) return; el.setAttribute("x1",x1); el.setAttribute("y1",y1); el.setAttribute("x2",x2); el.setAttribute("y2",y2); };
    const setText = (el,x,y,anchor="middle") => { if (!el) return; el.setAttribute("x",x); el.setAttribute("y",y); el.setAttribute("text-anchor",anchor); };
    const inRangePhaseX = (lambda, freq, t, fraction, minX, maxX, needNext=false) => {
      let x = lambda * (freq*t + fraction);
      while (x < minX) x += lambda;
      while (x > maxX) x -= lambda;
      if (needNext && x + lambda > maxX) x -= lambda;
      while (x < minX) x += lambda;
      return x;
    };

    labs.forEach((lab) => {
      const mode = lab.dataset.mode;
      lab._wave = { amplitude:42, wavelength:230, frequency:1 };
      lab._simTime = 0;
      lab._lastFrame = performance.now();
      lab._localPaused = false;
      lab._playbackSpeed = 1;

      lab.querySelectorAll("[data-wave-param]").forEach((input) => {
        const key = input.dataset.waveParam;
        input.addEventListener("input", () => {
          lab._wave[key] = Number(input.value);
          const out = lab.querySelector(`[data-wave-output="${key}"]`);
          if (out) out.textContent = key === "frequency" ? `${Number(input.value).toFixed(2)} Hz` : input.value;
        });
      });
      lab.querySelector("[data-wave-speed]")?.addEventListener("change", (e) => {
        lab._playbackSpeed = Number(e.target.value) || 1;
      });
      lab.querySelector("[data-wave-toggle]")?.addEventListener("click", (e) => {
        lab._localPaused = !lab._localPaused;
        e.currentTarget.textContent = lab._localPaused ? "▶ Play" : "⏸ Pause";
        e.currentTarget.classList.toggle("is-paused", lab._localPaused);
      });
      lab.querySelector("[data-wave-reset]")?.addEventListener("click", () => {
        lab._simTime = 0;
        lab._localPaused = false;
        lab._playbackSpeed = 1;
        const toggle = lab.querySelector("[data-wave-toggle]");
        if (toggle) { toggle.textContent = "⏸ Pause"; toggle.classList.remove("is-paused"); }
        const speed = lab.querySelector("[data-wave-speed]"); if (speed) speed.value = "1";
        lab.querySelectorAll("[data-wave-param]").forEach((input) => { input.value = input.defaultValue; input.dispatchEvent(new Event("input")); });
      });
      lab.querySelectorAll("[data-wave-particles]").forEach((group) => {
        const svg = group.closest("svg");
        const count = mode === "track" ? 34 : 30;
        for (let i=0;i<count;i++) {
          const c = document.createElementNS(ns,"circle");
          c.setAttribute("r", mode === "track" ? "7" : "5.5");
          c.dataset.particleIndex = String(i);
          if (mode === "track" && i === Math.floor(count/2)) { c.classList.add("tracked-particle"); c.setAttribute("fill","#ffd21f"); c.setAttribute("stroke","#6b5200"); c.setAttribute("stroke-width","4"); }
          group.appendChild(c);
        }
        svg.dataset.particleCount = String(count);
      });
    });

    const drawLabels = (svg,type,w,t,x0,span,mid,amp,lambda,freq) => {
      const minX=x0+18, maxX=x0+span-18;
      if (type === "transverse") {
        const crestX=inRangePhaseX(lambda,freq,t,.25,minX,maxX,true);
        const troughX=inRangePhaseX(lambda,freq,t,.75,minX,maxX,false);
        const crestY=mid-amp, troughY=mid+amp;
        setText(svg.querySelector('[data-crest-label]'), crestX, Math.max(15,crestY-9));
        setText(svg.querySelector('[data-trough-label]'), troughX, Math.min(204,troughY+20));
        const ampX=Math.min(maxX-8,crestX+34);
        setLine(svg.querySelector('[data-amp-line]'),ampX,mid,ampX,crestY);
        setText(svg.querySelector('[data-amp-label]'),ampX+8,(mid+crestY)/2+4,"start");
        const x1=crestX, x2=Math.min(maxX,crestX+lambda), wy=18;
        setLine(svg.querySelector('[data-lambda-line]'),x1,wy,x2,wy);
        setLine(svg.querySelector('[data-lambda-cap1]'),x1,wy-6,x1,wy+6);
        setLine(svg.querySelector('[data-lambda-cap2]'),x2,wy-6,x2,wy+6);
        setText(svg.querySelector('[data-lambda-label]'),(x1+x2)/2,wy+17);
      } else {
        const compX=inRangePhaseX(lambda,freq,t,.5,minX,maxX,true);
        const rareX=inRangePhaseX(lambda,freq,t,0,minX,maxX,false);
        setText(svg.querySelector('[data-compression-label]'),compX,62);
        setText(svg.querySelector('[data-rarefaction-label]'),rareX,168);
        const x1=compX, x2=Math.min(maxX,compX+lambda), wy=28;
        setLine(svg.querySelector('[data-long-lambda-line]'),x1,wy,x2,wy);
        setLine(svg.querySelector('[data-long-cap1]'),x1,wy-6,x1,wy+6);
        setLine(svg.querySelector('[data-long-cap2]'),x2,wy-6,x2,wy+6);
        setText(svg.querySelector('[data-long-lambda-label]'),(x1+x2)/2,wy-8);
      }
    };

    const draw = (now) => {
      labs.forEach((lab) => {
        const dt=Math.min(.05, Math.max(0,(now-(lab._lastFrame||now))/1000));
        lab._lastFrame=now;
        if (!state.paused && !lab._localPaused) lab._simTime += dt * lab._playbackSpeed;
        const t=lab._simTime;
        const mode=lab.dataset.mode;
        const w=lab._wave || {amplitude:42,wavelength:230,frequency:1};
        const amp=mode === "track" ? 62 : w.amplitude;
        const lambda=mode === "track" ? 250 : w.wavelength;
        const freq=mode === "track" ? .55 : w.frequency;
        lab.querySelectorAll("svg").forEach((svg) => {
          const type=svg.dataset.waveSvg;
          const particles=[...svg.querySelectorAll("[data-wave-particles] circle")];
          const x0=mode === "track" ? 35 : 25;
          const span=mode === "track" ? 690 : 590;
          const mid=mode === "track" ? 150 : 105;
          const pts=[];
          particles.forEach((c,i) => {
            const baseX=x0+span*i/Math.max(1,particles.length-1);
            const phase=2*Math.PI*(baseX/lambda-freq*t);
            const x=type === "longitudinal" ? baseX+amp*.58*Math.sin(phase) : baseX;
            const y=type === "transverse" ? mid-amp*Math.sin(phase) : mid;
            c.setAttribute("cx",x.toFixed(1)); c.setAttribute("cy",y.toFixed(1));
            if (type === "transverse") pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
          });
          const trace=svg.querySelector("[data-wave-trace]");
          if (trace) trace.setAttribute("d",pts.length?"M"+pts.join(" L"):"");
          const crest=svg.querySelector("[data-crest-marker]");
          if (crest) {
            const cx=inRangePhaseX(lambda,freq,t,.25,x0,x0+span,false);
            crest.setAttribute("cx",cx.toFixed(1)); crest.setAttribute("cy",String(mid-amp));
          }
          if (mode !== "track") drawLabels(svg,type,w,t,x0,span,mid,amp,lambda,freq);
        });
      });
      state.waveLabFrame=requestAnimationFrame(draw);
    };
    state.waveLabFrame=requestAnimationFrame(draw);
  }

  function mountFrequencyLabs() {
    stage.querySelectorAll("[data-frequency-lab]").forEach((lab) => {
      const ns="http://www.w3.org/2000/svg";
      const input=lab.querySelector("[data-freq-input]"); const out=lab.querySelector("[data-freq-output]");
      const toggle=lab.querySelector("[data-freq-toggle]"); const speed=lab.querySelector("[data-freq-speed]");
      const clock=lab.querySelector("[data-freq-clock]"); const count=lab.querySelector("[data-cycle-count]"); const live=lab.querySelector("[data-freq-live]");
      let f=Number(input.value), sim=0, last=performance.now(), paused=false, rate=1;
      lab.querySelectorAll("[data-freq-particles]").forEach((g)=>{for(let i=0;i<31;i++){const c=document.createElementNS(ns,"circle");c.setAttribute("r",i===15?"8":"5");if(i===15)c.classList.add("watch-particle");c.dataset.i=i;g.appendChild(c);}});
      input.addEventListener("input",()=>{f=Number(input.value);out.textContent=`${f.toFixed(1)} Hz`;live.textContent=`${f.toFixed(1)} Hz`;count.textContent=f.toFixed(1);sim=0;});
      speed.addEventListener("change",()=>rate=Number(speed.value)||1);
      toggle.addEventListener("click",()=>{paused=!paused;toggle.textContent=paused?"▶ Play":"⏸ Pause";});
      lab.querySelector("[data-freq-reset]")?.addEventListener("click",()=>{input.value="1";input.dispatchEvent(new Event("input"));speed.value="1";rate=1;paused=false;toggle.textContent="⏸ Pause";});
      const draw=(now)=>{const dt=Math.min(.05,(now-last)/1000);last=now;if(!paused&&!state.paused)sim+=dt*rate;const windowT=sim%1;clock.textContent=`${windowT.toFixed(2)} s`;count.textContent=f.toFixed(1);lab.querySelectorAll("[data-freq-svg]").forEach(svg=>{const type=svg.dataset.freqSvg;const pts=[];[...svg.querySelectorAll("[data-freq-particles] circle")].forEach((c,i)=>{const bx=25+590*i/30;const phase=2*Math.PI*(bx/230-f*sim);const x=type==="longitudinal"?bx+28*Math.sin(phase):bx;const y=type==="transverse"?110-42*Math.sin(phase):110;c.setAttribute("cx",x.toFixed(1));c.setAttribute("cy",y.toFixed(1));if(type==="transverse")pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);});const tr=svg.querySelector("[data-freq-trace]");if(tr)tr.setAttribute("d","M"+pts.join(" L"));});lab._freqFrame=requestAnimationFrame(draw);};lab._freqFrame=requestAnimationFrame(draw);
    });
  }

  function mountRippleLabs() {
    stage.querySelectorAll("[data-ripple-lab]").forEach((lab)=>{
      const svg=lab.querySelector("[data-ripple-svg]"); if(!svg)return; const ns="http://www.w3.org/2000/svg";
      const plane=svg.querySelector("[data-plane-fronts]"); const circ=svg.querySelector("[data-circular-fronts]");
      for(let i=0;i<9;i++){const line=document.createElementNS(ns,"line");line.classList.add("wavefront");line.dataset.i=i;line.setAttribute("y1","45");line.setAttribute("y2","305");plane.appendChild(line);}
      if(circ){for(let i=0;i<8;i++){const circle=document.createElementNS(ns,"circle");circle.classList.add("wavefront");circle.dataset.i=i;circle.setAttribute("cx","160");circle.setAttribute("cy","180");circ.appendChild(circle);}}
      let sim=0,last=performance.now(),paused=false,rate=1,f=1.2,source="plane",strobe=false;
      const srcSel=lab.querySelector("[data-ripple-source]"); const fin=lab.querySelector("[data-ripple-frequency]"); const fout=lab.querySelector("[data-ripple-fout]"); const tog=lab.querySelector("[data-ripple-toggle]"); const sp=lab.querySelector("[data-ripple-speed]");
      srcSel?.addEventListener("change",()=>{source=srcSel.value;svg.querySelector("[data-plane-source]")?.setAttribute("style",source==="plane"?"":"display:none");svg.querySelector("[data-point-source]")?.setAttribute("style",source==="circular"?"":"display:none");});
      const lambdaReadout=lab.querySelector("[data-ripple-lambda-readout]");
      const syncLambda=()=>{if(lambdaReadout)lambdaReadout.textContent=`Relative λ = ${(1/f).toFixed(2)}`;};
      fin?.addEventListener("input",()=>{f=Number(fin.value);if(fout)fout.textContent=f.toFixed(1);syncLambda();});syncLambda();sp?.addEventListener("change",()=>rate=Number(sp.value)||1);lab.querySelector("[data-ripple-strobe]")?.addEventListener("change",e=>strobe=e.target.checked);tog?.addEventListener("click",()=>{paused=!paused;tog.textContent=paused?"▶ Play":"⏸ Pause";});lab.querySelector("[data-ray-labels]")?.addEventListener("click",e=>{const g=svg.querySelector("[data-ray-text]");const hidden=g?.style.display==="none";if(g)g.style.display=hidden?"":"none";e.currentTarget.textContent=hidden?"Hide labels":"Show labels";});
      const draw=(now)=>{const dt=Math.min(.05,(now-last)/1000);last=now;if(!paused&&!state.paused)sim+=dt*rate;const spacing=74/f;let rightmostFront=0;[...plane.children].forEach((ln,i)=>{const x=95+((i*spacing+sim*85*f)%690);if(x<=740)rightmostFront=Math.max(rightmostFront,x);ln.setAttribute("x1",x.toFixed(1));ln.setAttribute("x2",x.toFixed(1));ln.style.opacity=strobe?(Math.sin(sim*24)>0?"1":".2"):"1";});const ra=svg.querySelector("[data-last-right-angle]");if(ra)ra.setAttribute("transform",`translate(${Math.max(120,rightmostFront).toFixed(1)} 0)`);if(circ){[...circ.children].forEach((cc,i)=>{const r=18+((i*spacing+sim*85*f)%(spacing*8));cc.setAttribute("r",r.toFixed(1));cc.style.display=source==="circular"?"":"none";cc.style.opacity=strobe?(Math.sin(sim*24)>0?"1":".2"):"1";});plane.style.display=source==="plane"||lab.dataset.rippleLab==="ray"?"":"none";}lab._rippleFrame=requestAnimationFrame(draw);};lab._rippleFrame=requestAnimationFrame(draw);
    });
  }

  function mountReflectionLabs(){
    stage.querySelectorAll("[data-reflection-lab]").forEach((lab)=>{
      const svg=lab.querySelector("[data-reflect-svg]"); if(!svg)return;
      const ns="http://www.w3.org/2000/svg";
      const inc=svg.querySelector("[data-incident-fronts]"); const ref=svg.querySelector("[data-reflected-fronts]");
      for(let i=0;i<7;i++){const a=document.createElementNS(ns,"line");a.classList.add("reflect-front");a.dataset.i=i;inc.appendChild(a);const b=document.createElementNS(ns,"line");b.classList.add("reflect-front");b.dataset.i=i;ref.appendChild(b);}
      const angleInput=lab.querySelector("[data-reflect-angle]"); const out=lab.querySelector("[data-reflect-out]"); const ib=lab.querySelector("[data-reflect-i]"); const rb=lab.querySelector("[data-reflect-r]"); const toggle=lab.querySelector("[data-reflect-toggle]"); const speedSel=lab.querySelector("[data-reflect-speed]");
      let angle=Number(angleInput?.value||35), sim=0, last=performance.now(), paused=false, rate=1;
      const sync=()=>{const txt=`${angle}°`; if(out)out.textContent=txt;if(ib)ib.textContent=txt;if(rb)rb.textContent=txt;}; sync();
      angleInput?.addEventListener("input",()=>{angle=Number(angleInput.value);sync();}); speedSel?.addEventListener("change",()=>rate=Number(speedSel.value)||1); toggle?.addEventListener("click",()=>{paused=!paused;toggle.textContent=paused?"▶ Play":"⏸ Pause";});
      const setLine=(el,x1,y1,x2,y2)=>{el.setAttribute("x1",x1.toFixed(1));el.setAttribute("y1",y1.toFixed(1));el.setAttribute("x2",x2.toFixed(1));el.setAttribute("y2",y2.toFixed(1));};
      const draw=(now)=>{const dt=Math.min(.05,(now-last)/1000);last=now;if(!paused&&!state.paused)sim+=dt*rate;const th=angle*Math.PI/180;const hit={x:410,y:310};const di={x:Math.sin(th),y:Math.cos(th)};const dr={x:Math.sin(th),y:-Math.cos(th)};const pi={x:Math.cos(th),y:-Math.sin(th)};const pr={x:Math.cos(th),y:Math.sin(th)};const spacing=58;const phase=(sim*95)%spacing;[...inc.children].forEach((ln,i)=>{const d=45+i*spacing-phase;const c={x:hit.x-di.x*d,y:hit.y-di.y*d};setLine(ln,c.x-pi.x*105,c.y-pi.y*105,c.x+pi.x*105,c.y+pi.y*105);});[...ref.children].forEach((ln,i)=>{const d=20+i*spacing+phase;const c={x:hit.x+dr.x*d,y:hit.y+dr.y*d};setLine(ln,c.x-pr.x*105,c.y-pr.y*105,c.x+pr.x*105,c.y+pr.y*105);});const ir=svg.querySelector("[data-incident-ray]");const rr=svg.querySelector("[data-reflected-ray]");setLine(ir,hit.x-di.x*245,hit.y-di.y*245,hit.x,hit.y);setLine(rr,hit.x,hit.y,hit.x+dr.x*245,hit.y+dr.y*245);
        const arcR=58; const polar=(deg)=>({x:hit.x+arcR*Math.sin(deg*Math.PI/180),y:hit.y-arcR*Math.cos(deg*Math.PI/180)});
        const p0={x:hit.x,y:hit.y-arcR}; const piEnd={x:hit.x-arcR*Math.sin(th),y:hit.y-arcR*Math.cos(th)}; const prEnd={x:hit.x+arcR*Math.sin(th),y:hit.y-arcR*Math.cos(th)};
        const ai=svg.querySelector("[data-angle-i]"); const ar=svg.querySelector("[data-angle-r]");
        if(ai)ai.setAttribute("d",`M${p0.x},${p0.y} A${arcR},${arcR} 0 0 0 ${piEnd.x},${piEnd.y}`);
        if(ar)ar.setAttribute("d",`M${p0.x},${p0.y} A${arcR},${arcR} 0 0 1 ${prEnd.x},${prEnd.y}`);
        const il=svg.querySelector("[data-angle-i-label]"); const rl=svg.querySelector("[data-angle-r-label]");
        if(il){il.textContent=`i = ${angle}°`;il.setAttribute("x",String(hit.x-92));il.setAttribute("y",String(hit.y-76));}
        if(rl){rl.textContent=`r = ${angle}°`;rl.setAttribute("x",String(hit.x+38));rl.setAttribute("y",String(hit.y-76));}
        lab._reflectFrame=requestAnimationFrame(draw);};lab._reflectFrame=requestAnimationFrame(draw);
    });
  }

  function mountPitchLoudnessLabs(){
    stage.querySelectorAll("[data-pitch-loudness-lab]").forEach((lab)=>{
      const svg=lab.querySelector("[data-pl-svg]"); const path=lab.querySelector("[data-pl-wave]");
      const fin=lab.querySelector("[data-pl-frequency]"); const ain=lab.querySelector("[data-pl-amplitude]");
      const fout=lab.querySelector("[data-pl-fout]"); const aout=lab.querySelector("[data-pl-aout]");
      const pitch=lab.querySelector("[data-pl-pitch]"); const loud=lab.querySelector("[data-pl-loud]");
      const toggle=lab.querySelector("[data-pl-toggle]"); const speed=lab.querySelector("[data-pl-speed]");
      let f=Number(fin.value), a=Number(ain.value), paused=false, rate=1, sim=0, last=performance.now();
      const sync=()=>{f=Number(fin.value);a=Number(ain.value);fout.textContent=f.toFixed(1);aout.textContent=String(a);pitch.textContent=f<2?"Low pitch":f>3.5?"High pitch":"Medium pitch";loud.textContent=a<32?"Quiet":a>56?"Loud":"Medium loudness";};
      fin.addEventListener("input",sync);ain.addEventListener("input",sync);speed.addEventListener("change",()=>rate=Number(speed.value)||1);toggle.addEventListener("click",()=>{paused=!paused;toggle.textContent=paused?"▶ Play":"⏸ Pause";});sync();
      const draw=(now)=>{const dt=Math.min(.05,(now-last)/1000);last=now;if(!paused&&!state.paused)sim+=dt*rate;const pts=[];for(let x=25;x<=735;x+=5){const y=130-a*Math.sin(2*Math.PI*(f*(x-25)/355-sim*.7));pts.push(`${x},${y.toFixed(1)}`);}path.setAttribute("d","M"+pts.join(" L"));lab._plFrame=requestAnimationFrame(draw);};lab._plFrame=requestAnimationFrame(draw);
    });
  }

  function mountFlashLaunchers(){
    stage.querySelectorAll("[data-flash-launch]").forEach((button)=>button.addEventListener("click",()=>{
      const card=button.closest("[data-flash-launch-card]"); const target=card?.querySelector("[data-flash-launch-target]"); if(!target)return;
      target.innerHTML=`<div class="flash-block launched-flash"><div class="media-shell ratio-4-3 flash-shell"><div class="flash-frame"><div class="flash-host" data-swf="${button.dataset.flashLaunch}" data-scale="showAll"></div></div></div><div class="flash-subtitle">Original Flash animation — use its own controls where available.</div></div>`;
      button.textContent="↺ Reload Flash animation"; mountFlash();
    }));
  }

  function mountGraphQuestionReveals(){
    const cards=[...stage.querySelectorAll(".graph-q")];
    if(window.STUDENT_EDITION && cards.length){
      cards.forEach((card,index)=>{
        const prompt=card.querySelector("b")?.textContent || "";
        card.querySelector(".reveal-model")?.remove();
        card.querySelector(".model-answer")?.remove();
        card.appendChild(makeStudentResponse(prompt,"graph",index));
      });
      return;
    }
    stage.querySelectorAll(".graph-q .reveal-model").forEach(btn=>btn.addEventListener("click",()=>{const ans=btn.parentElement.querySelector(".model-answer");ans?.classList.toggle("open");btn.textContent=ans?.classList.contains("open")?"Hide answer":"Reveal answer";}));
  }

  function syncTeacherTools(slide) {
    const title = document.getElementById("toolCurrentSlide");
    const info = document.getElementById("toolActivityInfo");
    if (title) title.textContent = `Slide ${slide.displayNo || (state.index + 1)}: ${slide.title}`;
    if (!info) return;
    if (!slide.activityMeta) {
      info.innerHTML = `<p>This slide has no special equipment. Use the timer, random picker, response tally or blank screen at any time.</p><p><b>Quick check:</b> ask students to explain one idea to a partner before the next reveal.</p>`;
      return;
    }
    const meta = slide.activityMeta;
    info.innerHTML = `<dl><dt>Time</dt><dd>${meta.time}</dd><dt>Equipment</dt><dd>${meta.equipment}</dd><dt>Setup</dt><dd>${meta.setup}</dd></dl><div class="tool-answer"><b>Answer:</b> ${meta.answer}</div><div class="tool-safety"><b>Safety:</b> ${meta.safety}</div>`;
  }

  function mountActivitySlide() {
    stage.querySelectorAll("[data-activity-reveal]").forEach((button) => button.addEventListener("click", () => {
      const name = button.dataset.activityReveal;
      const panel = stage.querySelector(`[data-activity-panel="${name}"]`);
      panel?.classList.toggle("open");
      button.textContent = panel?.classList.contains("open") ? (name === "teacher" ? "🧰 Hide teacher notes" : `Hide ${name}`) : (name === "teacher" ? "🧰 Teacher notes" : "Reveal answer");
    }));
    stage.querySelectorAll("[data-activity-close]").forEach((button) => button.addEventListener("click", () => {
      const name = button.dataset.activityClose;
      const panel = stage.querySelector(`[data-activity-panel="${name}"]`);
      panel?.classList.remove("open");
      const revealButton = stage.querySelector(`[data-activity-reveal="${name}"]`);
      if (revealButton) revealButton.textContent = name === "teacher" ? "🧰 Teacher notes" : "Reveal answer";
    }));
    stage.querySelectorAll("[data-activity-timer]").forEach((button) => button.addEventListener("click", () => {
      startToolTimer(Number(button.dataset.activityTimer));
      teacherToolsPanel.classList.add("open");
    }));
  }

  function render(index, updateHash = true) {
    stopCurrent();
    state.index = Math.max(0, Math.min(slides.length - 1, index));
    state.paused = false;
    const slide = slides[state.index];
    stage.classList.remove("paused");
    const sourceNo = slide.sourceSlide || (state.index + 1);
    const displayNo = slide.displayNo || String(sourceNo);
    stage.innerHTML = `<article class="slide ${slide.className || ""}">${quickResources()}${slideResourceTabs(sourceNo)}${slide.html}<span class="slide-number">${displayNo}</span></article>`;
    counter.textContent = window.STUDENT_EDITION ? `${displayNo} • Waves & Sound • ${window.STUDENT_LESSON ? `Lesson ${window.STUDENT_LESSON}` : "Student Edition"}` : `${displayNo} • Waves & Sound • 94 lesson slides + 19 activities + 12 lesson guides`;
    jumpInput.min = "1";
    jumpInput.max = "94";
    jumpInput.value = String(sourceNo);
    slideTitle.textContent = slide.title;
    document.getElementById("firstBtn").disabled = document.getElementById("prevBtn").disabled = state.index === 0;
    document.getElementById("lastBtn").disabled = document.getElementById("nextBtn").disabled = state.index === slides.length - 1;
    syncMediaButton(slide);
    syncTeacherTools(slide);
    mountFlash();
    mountSequence(slide.sequence);
    mountForceCards();
    mountVideoChoosers();
    mountWorksheetQuestions();
    mountRevealSequences();
    mountLessonLinks();
    mountGradientDemos();
    mountCarRoads();
    mountRulerLabs();
    mountPlotters();
    mountTeacherQAs();
    mountInlinePlots();
    mountTerminalVelocity();
    mountStoppingScenarioDemos();
    mountAverageJourney();
    mountActivitySlide();
    mountSlideResourceTabs();
    mountWaveLabs();
    mountFrequencyLabs();
    mountRippleLabs();
    mountReflectionLabs();
    mountPitchLoudnessLabs();
    mountFlashLaunchers();
    mountGraphQuestionReveals();
    thumbGrid.querySelectorAll(".thumb").forEach((el, i) => el.classList.toggle("current", i === state.index));
    if (updateHash) history.replaceState(null, "", `#/${slide.displayNo || (state.index + 1)}`);
  }

  function togglePause() {
    const slide = slides[state.index];
    if (!slide.pauseable) return;
    state.paused = !state.paused;
    stage.classList.toggle("paused", state.paused);
    stage.querySelectorAll("video").forEach((video) => {
      if (state.paused) {
        video.dataset.resumeAfterPause = String(!video.paused);
        video.pause();
      } else if (video.dataset.resumeAfterPause === "true") {
        video.play().catch(() => {});
        video.dataset.resumeAfterPause = "false";
      }
    });
    state.players.forEach((player) => {
      try {
        if (state.paused) {
          player.pause();
          const playOverlay = player.shadowRoot?.getElementById("play-button");
          if (playOverlay) playOverlay.style.display = "none";
        } else player.play();
      } catch (_) { /* Compatibility varies by SWF. */ }
    });
    if (state.sequence) {
      if (state.paused && state.sequence.timer) clearTimeout(state.sequence.timer);
      if (!state.paused) state.sequence.show();
    }
    syncMediaButton(slide);
  }

  function go(delta) { render(state.index + delta); }
  document.getElementById("firstBtn").onclick = () => render(0);
  document.getElementById("prevBtn").onclick = () => go(-1);
  document.getElementById("nextBtn").onclick = () => go(1);
  document.getElementById("lastBtn").onclick = () => render(slides.length - 1);
  const jumpToInput = () => {
    const requested = Number.parseInt(jumpInput.value, 10);
    if (!Number.isFinite(requested)) return;
    const index = sourceSlideIndex(Math.max(1, Math.min(94, requested)));
    if (index >= 0) render(index);
  };
  document.getElementById("jumpBtn").onclick = jumpToInput;
  jumpInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") jumpToInput();
  });
  mediaBtn.onclick = togglePause;
  document.getElementById("thumbBtn").onclick = () => thumbPanel.classList.add("open");
  document.getElementById("closeThumbs").onclick = () => thumbPanel.classList.remove("open");
  document.getElementById("fullBtn").onclick = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (_) { document.body.classList.toggle("fullscreen"); }
  };
  document.addEventListener("fullscreenchange", () => document.body.classList.toggle("fullscreen", Boolean(document.fullscreenElement)));
  document.getElementById("closeWarning").onclick = () => document.getElementById("fileWarning").style.display = "none";
  if (location.protocol === "file:") document.getElementById("fileWarning").style.display = "block";

  teacherToolsBtn.onclick = () => teacherToolsPanel.classList.toggle("open");
  document.getElementById("studentActivitiesBtn")?.addEventListener("click", () => window.open("STUDENT_ACTIVITIES.html", "_blank"));
  document.getElementById("assessmentBtn")?.addEventListener("click", () => window.open("ASSESSMENT_BOOK.html", "_blank"));
  document.getElementById("mythbustersBtn")?.addEventListener("click", () => window.open("MYTHBUSTERS_ACTIVITIES.html", "_blank"));
  document.getElementById("closeTeacherTools").onclick = () => teacherToolsPanel.classList.remove("open");
  document.querySelectorAll(".tool-tab").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll(".tool-tab").forEach((b) => b.classList.toggle("active", b === button));
    document.querySelectorAll(".tool-tab-page").forEach((page) => page.classList.toggle("active", page.dataset.toolPage === button.dataset.toolTab));
  }));
  document.querySelectorAll("[data-tool-minutes]").forEach((button) => button.addEventListener("click", () => startToolTimer(Number(button.dataset.toolMinutes))));
  document.getElementById("toolTimerPause").onclick = () => {
    toolState.paused = !toolState.paused;
    document.getElementById("toolTimerPause").textContent = toolState.paused ? "Resume" : "Pause";
  };
  document.getElementById("toolTimerReset").onclick = () => {
    clearInterval(toolState.interval);
    toolState.seconds = toolState.presetSeconds;
    toolState.paused = false;
    document.getElementById("toolTimerPause").textContent = "Pause";
    updateToolTimer();
  };
  document.getElementById("toolAttention").onclick = () => playAttentionSound(false);
  document.getElementById("toolPickName").onclick = () => {
    const names = document.getElementById("toolNames").value.split(/\n|,/).map((name) => name.trim()).filter(Boolean);
    document.getElementById("toolPickedName").textContent = names.length ? names[Math.floor(Math.random() * names.length)] : "Add names first";
  };
  document.querySelectorAll("[data-tally]").forEach((button) => button.addEventListener("click", () => {
    const letter = button.dataset.tally;
    toolState.tallies[letter] += 1;
    button.querySelector("b").textContent = String(toolState.tallies[letter]);
  }));
  document.getElementById("toolResetTally").onclick = () => {
    Object.keys(toolState.tallies).forEach((letter) => { toolState.tallies[letter] = 0; });
    document.querySelectorAll("[data-tally] b").forEach((value) => { value.textContent = "0"; });
  };
  const toggleBlankScreen = () => studentScreenBlank.classList.toggle("open");
  document.getElementById("toolBlankScreen").onclick = toggleBlankScreen;
  studentScreenBlank.onclick = toggleBlankScreen;
  document.getElementById("toolActivityLinks").innerHTML = slides.map((slide, index) => slide.activitySlide ? `<button type="button" data-tool-activity-index="${index}">${slide.displayNo}. ${slide.title}</button>` : "").join("");
  document.getElementById("toolActivityLinks").onclick = (event) => {
    const button = event.target.closest("[data-tool-activity-index]");
    if (!button) return;
    teacherToolsPanel.classList.remove("open");
    render(Number(button.dataset.toolActivityIndex));
  };
  updateToolTimer();

  thumbGrid.innerHTML = slides.map((slide, i) => `<button class="thumb ${slide.activitySlide ? "activity-thumb" : ""} ${slide.lessonPlanSlide ? "lesson-plan-thumb" : ""}" data-index="${i}"><span>${slide.displayNo || (i + 1)}</span><div class="thumb-preview"><strong>${slide.title}</strong></div></button>`).join("");
  thumbGrid.onclick = (event) => {
    const button = event.target.closest(".thumb");
    if (!button) return;
    thumbPanel.classList.remove("open");
    render(Number(button.dataset.index));
  };
  stage.addEventListener("click", (event) => {
    const cover = event.target.closest(".sim-value-cover");
    if (cover) {
      cover.classList.toggle("revealed");
      cover.textContent = cover.classList.contains("revealed") ? "Current value revealed — tap to cover" : "Current value covered — tap to reveal";
      return;
    }
    const target = event.target.closest("[data-slide-target]");
    if (!target) return;
    const numeric = Number(target.dataset.slideTarget);
    const index = Number.isFinite(numeric) ? sourceSlideIndex(numeric) : slides.findIndex((slide) => slide.title === target.dataset.slideTarget);
    if (index >= 0) render(index);
  });
  document.addEventListener("keydown", (event) => {
    if (event.target.closest("input, textarea, select, button, a, [contenteditable='true']")) return;
    if (["ArrowRight", "PageDown", " "].includes(event.key)) { event.preventDefault(); go(1); }
    else if (["ArrowLeft", "PageUp"].includes(event.key)) { event.preventDefault(); go(-1); }
    else if (event.key === "Home") render(0);
    else if (event.key === "End") render(slides.length - 1);
    else if (event.key.toLowerCase() === "p") togglePause();
    else if (event.key.toLowerCase() === "t") thumbPanel.classList.toggle("open");
    else if (event.key.toLowerCase() === "f") document.getElementById("fullBtn").click();
    else if (event.key.toLowerCase() === "k") teacherToolsPanel.classList.toggle("open");
    else if (event.key.toLowerCase() === "b") toggleBlankScreen();
    else if (event.key === "Escape") { thumbPanel.classList.remove("open"); teacherToolsPanel.classList.remove("open"); studentScreenBlank.classList.remove("open"); }
  });

  let touchStartX = null;
  let touchStartY = null;
  stage.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1 || event.target.closest("button, a, video, ruffle-player")) return;
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener("touchend", (event) => {
    if (touchStartX === null || !event.changedTouches.length) return;
    const deltaX = event.changedTouches[0].clientX - touchStartX;
    const deltaY = event.changedTouches[0].clientY - touchStartY;
    touchStartX = null;
    touchStartY = null;
    if (Math.abs(deltaX) < 55 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
    go(deltaX < 0 ? 1 : -1);
  }, { passive: true });
  window.addEventListener("hashchange", () => render(hashIndex(), false));
  render(hashIndex(), false);
})();
