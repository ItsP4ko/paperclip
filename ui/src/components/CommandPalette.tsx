import { useState, useEffect } from "react";
import { useNavigate } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useSidebar } from "../context/SidebarContext";
import { searchApi, type SearchResult } from "../api/search";
import { queryKeys } from "../lib/queryKeys";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  CircleDot,
  Bot,
  Hexagon,
  Target,
  LayoutDashboard,
  Inbox,
  DollarSign,
  History,
  SquarePen,
  Plus,
  Brain,
  Play,
} from "lucide-react";

const TYPE_CONFIG: Record<
  SearchResult["type"],
  { label: string; icon: typeof CircleDot; urlPrefix: string }
> = {
  issue: { label: "Issues", icon: CircleDot, urlPrefix: "/issues/" },
  agent: { label: "Agents", icon: Bot, urlPrefix: "/agents/" },
  project: { label: "Projects", icon: Hexagon, urlPrefix: "/projects/" },
  knowledge: { label: "Knowledge", icon: Brain, urlPrefix: "/knowledge/" },
  run: { label: "Runs", icon: Play, urlPrefix: "/runs/" },
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();
  const { openNewIssue, openNewAgent } = useDialog();
  const { isMobile, setSidebarOpen } = useSidebar();
  const searchQuery = query.trim();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
        if (isMobile) setSidebarOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobile, setSidebarOpen]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const { data: searchResults = [] } = useQuery({
    queryKey: queryKeys.search.query(selectedCompanyId!, searchQuery),
    queryFn: () => searchApi.search(selectedCompanyId!, searchQuery),
    enabled: !!selectedCompanyId && open && searchQuery.length > 1,
    placeholderData: (prev) => prev,
  });

  const grouped = searchResults.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});

  function go(path: string) {
    setOpen(false);
    navigate(path);
  }

  const showResults = searchQuery.length > 1 && searchResults.length > 0;

  return (
    <CommandDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v && isMobile) setSidebarOpen(false);
      }}
    >
      <CommandInput
        placeholder="Search issues, agents, projects, knowledge, runs..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {!showResults && (
          <>
            <CommandGroup heading="Actions">
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  openNewIssue();
                }}
              >
                <SquarePen className="mr-2 h-4 w-4" />
                Create new issue
                <span className="ml-auto text-xs text-muted-foreground">C</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  openNewAgent();
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create new agent
              </CommandItem>
              <CommandItem onSelect={() => go("/projects")}>
                <Plus className="mr-2 h-4 w-4" />
                Create new project
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Pages">
              <CommandItem onSelect={() => go("/dashboard")}>
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Dashboard
              </CommandItem>
              <CommandItem onSelect={() => go("/inbox")}>
                <Inbox className="mr-2 h-4 w-4" />
                Inbox
              </CommandItem>
              <CommandItem onSelect={() => go("/issues")}>
                <CircleDot className="mr-2 h-4 w-4" />
                Issues
              </CommandItem>
              <CommandItem onSelect={() => go("/projects")}>
                <Hexagon className="mr-2 h-4 w-4" />
                Projects
              </CommandItem>
              <CommandItem onSelect={() => go("/goals")}>
                <Target className="mr-2 h-4 w-4" />
                Goals
              </CommandItem>
              <CommandItem onSelect={() => go("/agents")}>
                <Bot className="mr-2 h-4 w-4" />
                Agents
              </CommandItem>
              <CommandItem onSelect={() => go("/costs")}>
                <DollarSign className="mr-2 h-4 w-4" />
                Costs
              </CommandItem>
              <CommandItem onSelect={() => go("/activity")}>
                <History className="mr-2 h-4 w-4" />
                Activity
              </CommandItem>
            </CommandGroup>
          </>
        )}

        {showResults &&
          (Object.entries(grouped) as [SearchResult["type"], SearchResult[]][]).map(
            ([type, items]) => {
              const config = TYPE_CONFIG[type];
              const Icon = config.icon;
              return (
                <div key={type}>
                  <CommandSeparator />
                  <CommandGroup heading={config.label}>
                    {items.slice(0, 5).map((item) => (
                      <CommandItem
                        key={`${type}-${item.id}`}
                        value={`${searchQuery} ${item.title} ${item.subtitle ?? ""}`}
                        onSelect={() => go(`${config.urlPrefix}${item.id}`)}
                      >
                        <Icon className="mr-2 h-4 w-4" />
                        <span className="flex-1 truncate">{item.title}</span>
                        {item.subtitle && (
                          <span className="ml-2 text-xs text-muted-foreground truncate max-w-[150px]">
                            {item.subtitle}
                          </span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </div>
              );
            },
          )}
      </CommandList>
    </CommandDialog>
  );
}
