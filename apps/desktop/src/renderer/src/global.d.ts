import type { NoteForestApi } from '../../shared/api';

declare global {
  interface Window {
    noteforest: NoteForestApi;
    __noteforest?: import('./testApi').NoteForestTestApi;
  }
}

export {};
