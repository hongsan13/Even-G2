import { OsEventTypeList, type EvenHubEvent } from '@evenrealities/even_hub_sdk';
export type InputAction = { kind: 'next' | 'previous' | 'exit' | 'foreground' | 'background' } | { kind: 'menu'; id: number };
function eventType(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
  return envelope ? envelope.eventType ?? OsEventTypeList.CLICK_EVENT : null;
}
export function inputAction(event: EvenHubEvent): InputAction | null {
  if (event.menuItemClickEvent?.itemID !== undefined) return { kind: 'menu', id: event.menuItemClickEvent.itemID };
  const sys = eventType(event.sysEvent), text = eventType(event.textEvent);
  if (sys === OsEventTypeList.DOUBLE_CLICK_EVENT || text === OsEventTypeList.DOUBLE_CLICK_EVENT
    || sys === OsEventTypeList.SYSTEM_EXIT_EVENT || sys === OsEventTypeList.ABNORMAL_EXIT_EVENT) return { kind: 'exit' };
  if (sys === OsEventTypeList.FOREGROUND_EXIT_EVENT) return { kind: 'background' };
  if (sys === OsEventTypeList.FOREGROUND_ENTER_EVENT) return { kind: 'foreground' };
  if (text === OsEventTypeList.SCROLL_TOP_EVENT) return { kind: 'previous' };
  if (text === OsEventTypeList.SCROLL_BOTTOM_EVENT) return { kind: 'next' };
  if (sys === OsEventTypeList.CLICK_EVENT || text === OsEventTypeList.CLICK_EVENT) return { kind: 'next' };
  return null;
}
