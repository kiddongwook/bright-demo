import type { ComponentType } from 'react';
import { Today } from './director/Today';
import { Makeup } from './director/Makeup';
import { NoticeList, NoticeNew, Readers } from './director/Notices';
import { Inbox, Answer, FaqManage } from './director/Inbox';
import { More, Roster, Academy } from './director/More';
import { Child, Absence } from './parent/Child';
import { Ask, AskNew, AskMine } from './parent/Ask';
import { NoticeFeed, NoticeView } from './shared/NoticeRead';
import { MoreSimple } from './shared/More';
import { Install } from './shared/Install';
import { Me } from './student/Me';

const ParentNotices = () => <NoticeFeed who="우리 아이 반" />;
const StudentNotices = () => <NoticeFeed who="우리 반" />;

/* '<role>:<view>' → 화면 */
export const SCREENS: Record<string, ComponentType<any>> = {
  'director:today': Today, 'director:makeup': Makeup,
  'director:notice': NoticeList, 'director:notice-new': NoticeNew, 'director:readers': Readers,
  'director:inbox': Inbox, 'director:answer': Answer, 'director:faq': FaqManage,
  'director:more': More, 'director:roster': Roster, 'director:academy': Academy,
  'teacher:today': Today, 'teacher:makeup': Makeup, 'teacher:notice': NoticeList, 'teacher:notice-new': NoticeNew, 'teacher:readers': Readers,
  'teacher:inbox': Inbox, 'teacher:answer': Answer, 'teacher:faq': FaqManage, 'teacher:more': More, 'teacher:roster': Roster,
  'parent:child': Child, 'parent:absence': Absence, 'parent:notice': ParentNotices, 'parent:notice-view': NoticeView,
  'parent:ask': Ask, 'parent:ask-new': AskNew, 'parent:ask-mine': AskMine, 'parent:more': MoreSimple,
  '*:install': Install,
  'student:me': Me, 'student:notice': StudentNotices, 'student:notice-view': NoticeView, 'student:more': MoreSimple,
};
