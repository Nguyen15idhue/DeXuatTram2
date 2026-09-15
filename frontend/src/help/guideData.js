import { userGuide } from './guideData.user';
import { adminDataGuide } from './guideData.adminData';
import { adminConfigGuide } from './guideData.adminConfig';
import { groupsGuide } from './guideData.groups';
import { flowsGuide } from './guideData.flows';
import { integrationsGuide } from './guideData.integrations';
import { startGuide } from './guideData.start';

export const GUIDE = {
  user: userGuide,
  admin: {
    title: 'Hướng dẫn cho Super Admin',
    sections: [...adminDataGuide.sections, ...adminConfigGuide.sections],
  },
  groups: { ...groupsGuide, sections: [startGuide, ...groupsGuide.sections] },
  flows: flowsGuide,
  integrations: integrationsGuide,
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
