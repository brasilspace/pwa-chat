/**
 * use-prilog-events.ts — Re-Export des SSE Event-Hooks
 *
 * Entkoppelt den Import-Pfad vom Workflow-Modul.
 * Bestehende Imports von '@/features/workflow/use-workflow-events'
 * funktionieren weiterhin.
 */

export { useWorkflowEvents, useWorkflowEvents as usePrilogEvents } from '@/features/workflow/use-workflow-events';
