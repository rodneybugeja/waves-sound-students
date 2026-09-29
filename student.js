
(() => {
  "use strict";
  const lesson = Number(window.STUDENT_LESSON) || 0;

  const lessonsBtn = document.getElementById('studentLessonsBtn');
  if (lessonsBtn) lessonsBtn.addEventListener('click', () => {
    window.location.href = 'STUDENT_LESSONS.html';
  });
  const key = `waves_sound_student_notes_lesson_${lesson || 'all'}`;
  const panel = document.getElementById('studentNotesPanel');
  const text = document.getElementById('studentNotesText');
  const label = document.getElementById('studentNotesLesson');
  const open = document.getElementById('studentNotesBtn');
  const close = document.getElementById('closeStudentNotes');
  if (label) label.textContent = lesson ? `Lesson ${lesson} • saved on this laptop` : 'All lessons • saved on this laptop';
  try { text.value = localStorage.getItem(key) || ''; } catch (_) {}
  open?.addEventListener('click', () => panel?.classList.toggle('open'));
  close?.addEventListener('click', () => panel?.classList.remove('open'));
  text?.addEventListener('input', () => { try { localStorage.setItem(key, text.value); } catch (_) {} });
  document.getElementById('clearStudentNotes')?.addEventListener('click', () => {
    if (!confirm('Clear your saved notes for this lesson?')) return;
    text.value=''; try { localStorage.removeItem(key); } catch (_) {}
  });
  document.getElementById('downloadStudentNotes')?.addEventListener('click', () => {
    const heading = lesson ? `Waves & Sound - Lesson ${lesson}` : 'Waves & Sound - Student Notes';
    const blob = new Blob([heading+'\n\n'+(text.value||'')], {type:'text/plain;charset=utf-8'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=(lesson?`waves_sound_lesson_${lesson}_notes.txt`:'waves_sound_notes.txt'); a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  });
  // Student edition: teacher keyboard shortcuts should do nothing.
  document.addEventListener('keydown', (e) => {
    if (['k','b'].includes(e.key.toLowerCase()) && !e.target.closest('input,textarea,select')) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
})();
