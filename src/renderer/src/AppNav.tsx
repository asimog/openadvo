import { Divider } from "@astryxdesign/core/Divider";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { Text } from "@astryxdesign/core/Text";
import { Cog6ToothIcon, FolderIcon, HomeIcon, PlusIcon } from "@heroicons/react/24/outline";
import { Cog6ToothIcon as Cog6ToothIconSolid, FolderOpenIcon, HomeIcon as HomeIconSolid } from "@heroicons/react/24/solid";
import type { MatterSummary } from "../../shared/api.ts";

/** The side navigation: collapsible and resizable. It lists the matters and starts a new one. The title bar holds its toggle. */
export function AppNav(props: {
  matters: MatterSummary[];
  matterId: string | null;
  /** The window owns the collapsed state: the navigation folds to its icon rail while a document is open. */
  isCollapsed: boolean;
  onCollapsedChange: (isCollapsed: boolean) => void;
  onHome: () => void;
  onNewMatter: () => void;
  onOpenMatter: (matterId: string) => void;
  /** V3-4. */
  settingsOpen: boolean;
  onSettings: () => void;
}) {
  return (
    <SideNav
      collapsible={{ isCollapsed: props.isCollapsed, onCollapsedChange: props.onCollapsedChange, hasButton: false }}
      resizable={{ defaultWidth: 264, minWidth: 200, maxWidth: 400 }}
    >
      <SideNavSection title="Menu" isHeaderHidden>
        <SideNavItem label="New matter" icon={PlusIcon} onClick={props.onNewMatter} />
        <SideNavItem label="Home" icon={HomeIcon} selectedIcon={HomeIconSolid} isSelected={props.matterId === null && !props.settingsOpen} onClick={props.onHome} />
        <SideNavItem label="Settings" icon={Cog6ToothIcon} selectedIcon={Cog6ToothIconSolid} isSelected={props.settingsOpen} onClick={props.onSettings} />
      </SideNavSection>
      <Divider />
      <SideNavSection title="Matters">
        {props.matters.map((m) => (
          <SideNavItem
            key={m.id}
            label={m.title}
            icon={FolderIcon}
            selectedIcon={FolderOpenIcon}
            isSelected={m.id === props.matterId}
            onClick={() => props.onOpenMatter(m.id)}
          />
        ))}
      </SideNavSection>
      {props.matters.length === 0 ? (
        <div className="nav-empty">
          <Text type="supporting">No matters yet.</Text>
        </div>
      ) : null}
    </SideNav>
  );
}
