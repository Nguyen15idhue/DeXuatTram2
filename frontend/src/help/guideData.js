import { groupsGuide } from './guideData.groups';
import { flowsGuide } from './guideData.flows';
import { startGuide } from './guideData.start';

export const GUIDE = {
  groups: { ...groupsGuide, sections: [startGuide, ...groupsGuide.sections] },
  flows: flowsGuide,
};

const stepById = {};
for (const st of startGuide.steps) stepById[st.id] = st;
for (const s of groupsGuide.sections) {
  for (const st of s.steps) stepById[st.id] = st;
}

export function resolveFlowStep(step) {
  if (!step.ref) return step;
  const base = stepById[step.ref] || {};
  return { ...base, ...step, id: step.ref, title: base.title || step.ref };
}
