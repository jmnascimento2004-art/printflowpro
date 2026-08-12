import type { WhatsAppSystemMessage, WhatsAppSystemMessageDefinition, WhatsAppSystemMessageOverride } from './types';

export function resolveWhatsAppSystemMessage(
  definition: WhatsAppSystemMessageDefinition,
  override: WhatsAppSystemMessageOverride | null = null
): WhatsAppSystemMessage {
  return {
    kind: 'system',
    definition,
    override,
    content: override?.content || definition.defaultContent,
    active: override ? override.active : definition.enabledByDefault,
    customized: Boolean(override)
  };
}

export function getWhatsAppSystemMessages(
  definitions: readonly WhatsAppSystemMessageDefinition[],
  overrides: readonly WhatsAppSystemMessageOverride[]
) {
  const overrideByEvent = new Map(overrides.map((template) => [template.event_key, template]));
  return definitions.map((definition) => (
    resolveWhatsAppSystemMessage(definition, overrideByEvent.get(definition.eventKey) || null)
  ));
}
