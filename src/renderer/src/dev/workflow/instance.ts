// DEVELOPMENT-ONLY. The one demo workflow used by the screens: created on first use, kept for
// the life of the window, so leaving the demo and coming back keeps its in-memory data and lets
// running simulated jobs finish. A window reload discards everything (nothing is persisted).
// Created outside React so StrictMode's double rendering cannot create a second instance.
import { systemClock, systemTimers } from './clock';
import { type DemoWorkflow, createDemoWorkflow } from './engine';
import { DEMO_SIMULATORS } from './simulators';
import { createInMemoryStore, seedState } from './store';

let instance: DemoWorkflow | null = null;

export function demoWorkflow(): DemoWorkflow {
  instance ??= createDemoWorkflow({
    store: createInMemoryStore(seedState(systemClock.now())),
    clock: systemClock,
    timers: systemTimers,
    adapters: DEMO_SIMULATORS,
  });
  return instance;
}
