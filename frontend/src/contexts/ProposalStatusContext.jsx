import { createContext, useContext } from 'react';

export const ProposalStatusContext = createContext(false);
export const useNumberedProposalStatuses = () => useContext(ProposalStatusContext);
