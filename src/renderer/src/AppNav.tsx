import { Badge } from "@astryxdesign/core/Badge";
import { Divider } from "@astryxdesign/core/Divider";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { Text } from "@astryxdesign/core/Text";
import {
  AcademicCapIcon,
  BookOpenIcon,
  BuildingLibraryIcon,
  CalendarDaysIcon,
  Cog6ToothIcon,
  FolderIcon,
  GlobeAltIcon,
  HomeIcon,
  InboxStackIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  RectangleStackIcon,
  SparklesIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { Cog6ToothIcon as Cog6ToothIconSolid, FolderOpenIcon, HomeIcon as HomeIconSolid } from "@heroicons/react/24/solid";
import type { MatterSummary } from "../../shared/api.ts";
import type { Page } from "./Pages.tsx";

/**
 * Q5: the left navigation pane of advocate-workflow.md section 3. It folds to an icon rail
 * while a source or a draft is open (the window owns the collapsed state). The open matters are
 * listed under Matters; the advocate's name and Settings are at its foot.
 */
export function AppNav(props: {
  matters: MatterSummary[];
  matterId: string | null;
  /** The window owns the collapsed state: the navigation folds to its icon rail while a document is open. */
  isCollapsed: boolean;
  onCollapsedChange: (isCollapsed: boolean) => void;
  onHome: () => void;
  onNewMatter: () => void;
  onOpenMatter: (matterId: string) => void;
  settingsOpen: boolean;
  onSettings: () => void;
  page: Page;
  onPage: (page: Page) => void;
  onSearch: () => void;
  /** R1: the items that block the work, across matters. */
  inboxBlocking: number;
  advocateName: string | null;
}) {
  const at = (p: Page) => props.matterId === null && !props.settingsOpen && props.page === p;
  return (
    <SideNav
      collapsible={{ isCollapsed: props.isCollapsed, onCollapsedChange: props.onCollapsedChange, hasButton: false }}
      resizable={{ defaultWidth: 264, minWidth: 200, maxWidth: 400 }}
    >
      <SideNavSection title="Start" isHeaderHidden>
        <SideNavItem label="New matter" icon={PlusIcon} onClick={props.onNewMatter} />
        <SideNavItem label="Search" icon={MagnifyingGlassIcon} onClick={props.onSearch} data-testid="nav-search" />
      </SideNavSection>
      <Divider />
      <SideNavSection title="Menu" isHeaderHidden>
        <SideNavItem label="Home" icon={HomeIcon} selectedIcon={HomeIconSolid} isSelected={at("home")} onClick={props.onHome} />
        <SideNavItem
          label="Review Inbox"
          icon={InboxStackIcon}
          isSelected={at("inbox")}
          onClick={() => props.onPage("inbox")}
          data-testid="nav-inbox"
          endContent={props.inboxBlocking > 0 ? <Badge label={String(props.inboxBlocking)} /> : undefined}
        />
        <SideNavItem label="Matters" icon={RectangleStackIcon} isSelected={at("matters")} onClick={() => props.onPage("matters")} data-testid="nav-matters" />
      </SideNavSection>
      <SideNavSection title="Matters">
        {props.matters.map((m) => (
          <SideNavItem key={m.id} label={m.title} icon={FolderIcon} selectedIcon={FolderOpenIcon} isSelected={m.id === props.matterId} onClick={() => props.onOpenMatter(m.id)} />
        ))}
      </SideNavSection>
      {props.matters.length === 0 ? (
        <div className="nav-empty">
          <Text type="supporting">No matters yet.</Text>
        </div>
      ) : null}
      <Divider />
      <SideNavSection title="Practice" isHeaderHidden>
        <SideNavItem label="Calendar" icon={CalendarDaysIcon} isSelected={at("calendar")} onClick={() => props.onPage("calendar")} data-testid="nav-calendar" />
        <SideNavItem label="Research" icon={BookOpenIcon} isSelected={at("research")} onClick={() => props.onPage("research")} data-testid="nav-research" />
        <SideNavItem label="Knowledge" icon={AcademicCapIcon} isSelected={at("knowledge")} onClick={() => props.onPage("knowledge")} data-testid="nav-knowledge" />
        <SideNavItem label="Court Intelligence" icon={BuildingLibraryIcon} isSelected={at("court")} onClick={() => props.onPage("court")} data-testid="nav-court" />
        <SideNavItem label="Browser" icon={GlobeAltIcon} isSelected={at("browser")} onClick={() => props.onPage("browser")} data-testid="nav-browser" />
        <SideNavItem label="Workflows & Skills" icon={SparklesIcon} isSelected={at("skills")} onClick={() => props.onPage("skills")} data-testid="nav-skills" />
      </SideNavSection>
      <Divider />
      <SideNavSection title="You" isHeaderHidden>
        <SideNavItem label={props.advocateName || "Advocate profile"} icon={UserCircleIcon} isSelected={at("profile")} onClick={() => props.onPage("profile")} data-testid="nav-profile" />
        <SideNavItem label="Settings" icon={Cog6ToothIcon} selectedIcon={Cog6ToothIconSolid} isSelected={props.settingsOpen} onClick={props.onSettings} />
      </SideNavSection>
    </SideNav>
  );
}

