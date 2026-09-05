import type { ComponentType } from 'react';
import { Today } from './director/Today';
import { Makeup } from './director/Makeup';
import { NoticeList, NoticeNew, Readers } from './director/Notices';
import { Inbox, Answer, FaqManage } from './director/Inbox';
import { More, Academy } from './director/More';
import { Roster, StudentEdit, Teachers } from './director/Roster';
import { StudentDetail } from './director/StudentDetail';
import { CalendarScreen, Classes } from './director/Calendar';
import { Stats } from './director/Stats';
import { Billing, BillingSettings } from './director/Billing';
import { Import } from './director/Import';
import { Todos } from './director/Todos';
import { ChildMonth } from './parent/ChildMonth';
import { Child, Absence } from './parent/Child';
import { Ask, AskNew, AskMine } from './parent/Ask';
import { NoticeFeed, NoticeView } from './shared/NoticeRead';
import { MoreSimple } from './shared/More';
import { Install } from './shared/Install';
import { About } from './shared/About';
import { Prefs } from './shared/Prefs';
import { Me } from './student/Me';
import { OpHome } from './operator/OpHome';
import { OpAcademy } from './operator/OpAcademy';
import { OpNew } from './operator/OpNew';
import { OpSettings } from './operator/OpSettings';

const ParentNotices = () => <NoticeFeed who="우리 아이 반" />;
const StudentNotices = () => <NoticeFeed who="우리 반" />;

/* '<role>:<view>' → 화면 */
export const SCREENS: Record<string, ComponentType<any>> = {
  'director:today': Today, 'director:makeup': Makeup,
  'director:notice': NoticeList, 'director:notice-new': NoticeNew, 'director:readers': Readers,
  'director:inbox': Inbox, 'director:answer': Answer, 'director:faq': FaqManage,
  'director:more': More, 'director:roster': Roster, 'director:academy': Academy, 'director:student-edit': StudentEdit, 'director:teachers': Teachers,
  'director:student': StudentDetail, 'director:calendar': CalendarScreen, 'director:classes': Classes, 'director:stats': Stats, 'director:import': Import,
  'director:todos': Todos, 'teacher:todos': Todos,
  'director:billing': Billing, 'director:billing-settings': BillingSettings,
  'parent:child-month': ChildMonth,
  'teacher:student': StudentDetail, 'teacher:calendar': CalendarScreen, 'teacher:classes': Classes,
  'teacher:today': Today, 'teacher:makeup': Makeup, 'teacher:notice': NoticeList, 'teacher:notice-new': NoticeNew, 'teacher:readers': Readers,
  'teacher:inbox': Inbox, 'teacher:answer': Answer, 'teacher:faq': FaqManage, 'teacher:more': More, 'teacher:roster': Roster, 'teacher:student-edit': StudentEdit, 'teacher:teachers': Teachers,
  'parent:child': Child, 'parent:absence': Absence, 'parent:notice': ParentNotices, 'parent:notice-view': NoticeView,
  'parent:ask': Ask, 'parent:ask-new': AskNew, 'parent:ask-mine': AskMine, 'parent:more': MoreSimple,
  '*:install': Install, '*:about': About, '*:prefs': Prefs,
  'student:me': Me, 'student:notice': StudentNotices, 'student:notice-view': NoticeView, 'student:more': MoreSimple,
  /* BRIGHT 운영자 — 학원 소속이 아닌 화면 묶음 (0023) */
  'operator:op-home': OpHome, 'operator:op-academy': OpAcademy, 'operator:op-new': OpNew, 'operator:op-settings': OpSettings,
};
