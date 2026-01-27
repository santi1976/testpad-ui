import * as React from 'react';
import { Avatar, AvatarFallback } from './avatar';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from './button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckCircle, Clock, PlayCircle, Copy, Square, CheckSquare } from 'lucide-react';
import { toast } from 'sonner';

interface Assignment {
    runId: string;
    scriptId?: string;
    scriptName: string;
    projectName: string;
    status: 'complete' | 'started' | 'new' | 'unknown';
    progress: string;
}

interface TesterData {
    name: string;
    email?: string;
    runs: number;
    fails: number;
    completed?: number;
    inProgress?: number;
    assignments: Assignment[];
}

const generateBulkMessage = (testers: TesterData[]) => {
    if (testers.length === 1) {
        const t = testers[0];
        const pending = t.assignments.filter(a => a.status !== 'complete');

        const byProject = pending.reduce((acc, curr) => {
            if (!acc[curr.projectName]) acc[curr.projectName] = [];
            acc[curr.projectName].push(curr.scriptName);
            return acc;
        }, {} as Record<string, string[]>);

        let msg = `Hi ${t.name}, could you please update the status for the following?`;

        if (pending.length > 0) {
            msg += `\n\n`;
            Object.entries(byProject).forEach(([proj, scripts]) => {
                msg += `*${proj}*\n${scripts.map(s => `   - ${s}`).join('\n')}\n`;
            });
        } else {
            msg += " (Looks all clear, just checking in!)";
        }
        return msg;
    }

    return `*Team Status Check*\n\n` + testers.map(t => {
        const completionRate = t.runs > 0 ? Math.round(((t.completed || 0) / t.runs) * 100) : 0;
        const pending = t.assignments.filter(a => a.status !== 'complete');

        let detail = "";
        if (pending.length > 0) {
            if (pending.length <= 3) {
                detail = `Pending: ${pending.map(p => `${p.scriptName} (*${p.projectName}*)`).join(', ')}`;
            } else {
                const projects = Array.from(new Set(pending.map(p => p.projectName)));
                detail = `Pending: ${pending.length} scripts in ${projects.map(p => `*${p}*`).join(', ')}`;
            }
        } else {
            detail = "All Clear";
        }

        return `@${t.name} | ${completionRate}% Done (${t.completed}/${t.runs}) | ${detail}`;
    }).join('\n');
};

const copyToClipboard = (text: string, onSuccess: () => void) => {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(onSuccess).catch(() => fallbackCopy(text, onSuccess));
    } else {
        fallbackCopy(text, onSuccess);
    }
};

const fallbackCopy = (text: string, onSuccess: () => void) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        onSuccess();
    } catch {
        toast.error("Clipboard copy failed");
    } finally {
        document.body.removeChild(textArea);
    }
};

function TesterCard({
    tester,
    isSelected,
    onToggle
}: {
    tester: TesterData,
    isSelected: boolean,
    onToggle: () => void
}) {
    const completionRate = tester.runs > 0 ? Math.round(((tester.completed || 0) / tester.runs) * 100) : 0;

    return (
        <div className={`p-2 rounded-md border bg-card/50 hover:bg-card transition-all group relative ${isSelected ? 'ring-2 ring-primary border-primary' : ''}`}>
            <div className={`absolute top-2 right-2 z-10 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                <Checkbox checked={isSelected} onCheckedChange={onToggle} className="h-4 w-4 bg-background" />
            </div>

            <Sheet>
                <SheetTrigger asChild>
                    <div className="flex items-center gap-2 cursor-pointer">
                        <Avatar className="h-8 w-8 border bg-muted text-muted-foreground font-semibold text-xs shrink-0">
                            <AvatarFallback>{tester.name.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0 pr-6">
                            <div className="flex items-center justify-between mb-1">
                                <div className="font-medium text-xs truncate">{tester.name}</div>
                                <div className="text-[10px] text-muted-foreground font-medium">{completionRate}%</div>
                            </div>

                            <div className="h-1 bg-muted rounded-full overflow-hidden w-full">
                                <div className="h-full bg-primary transition-all duration-500" style={{ width: `${completionRate}%` }} />
                            </div>
                        </div>
                    </div>
                </SheetTrigger>

                <SheetContent className="w-[400px] sm:w-[540px] flex flex-col h-full">
                    <SheetHeader className="pb-6 border-b">
                        <div className="flex items-center gap-4">
                            <Avatar className="h-16 w-16 border-4 border-muted text-2xl">
                                <AvatarFallback>{tester.name.charAt(0).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div>
                                <SheetTitle className="text-xl">{tester.name}</SheetTitle>
                                <SheetDescription>{tester.email}</SheetDescription>
                            </div>
                        </div>
                        <div className="flex gap-4 mt-4">
                            <Badge variant="outline" className="text-sm py-1 px-3">
                                {tester.completed}/{tester.runs} Completed
                            </Badge>
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-2 ml-auto"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const msg = generateBulkMessage([tester]);
                                    copyToClipboard(msg, () => toast.success(`Copied reminder for ${tester.name}`));
                                }}
                            >
                                <Copy className="h-3.5 w-3.5" />
                                Copy Slack Reminder
                            </Button>
                        </div>
                    </SheetHeader>
                    <ScrollArea className="flex-1 -mx-6 px-6 py-6">
                        <div className="space-y-2">
                            {tester.assignments?.map((a, i) => (
                                <div key={i} className="p-3 rounded-md border flex items-center justify-between hover:bg-muted/40 transition-colors">
                                    <div className="flex-1 min-w-0 pr-4">
                                        <div className="text-sm font-medium">{a.scriptName}</div>
                                        <div className="text-xs text-muted-foreground">{a.projectName}</div>
                                    </div>
                                    <Badge variant={a.status === 'complete' ? 'default' : a.status === 'started' ? 'secondary' : 'outline'}>{a.status}</Badge>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </SheetContent>
            </Sheet>
        </div>
    );
}

export function TesterKanbanBoard({ data }: { data: TesterData[] }) {
    const [selectedTesters, setSelectedTesters] = React.useState<Set<string>>(new Set());

    if (!data || data.length === 0) return <div className="text-center py-8 text-muted-foreground">No active testers.</div>;

    const notStarted = data.filter(t => t.runs > 0 && (t.completed === 0 && (!t.inProgress || t.inProgress === 0)));
    const inProgress = data.filter(t => t.runs > 0 && !notStarted.includes(t) && (t.completed || 0) < t.runs);
    const completed = data.filter(t => t.runs > 0 && t.completed === t.runs);

    const toggleSelection = (name: string) => {
        const newSet = new Set(selectedTesters);
        if (newSet.has(name)) newSet.delete(name);
        else newSet.add(name);
        setSelectedTesters(newSet);
    };

    const handleCopyReminders = () => {
        const selected = data.filter(t => selectedTesters.has(t.name));
        if (selected.length === 0) {
            toast.error('No testers selected');
            return;
        }
        const msg = generateBulkMessage(selected);
        copyToClipboard(msg, () => toast.success(`Copied reminders for ${selected.length} testers!`));
        setSelectedTesters(new Set());
    };

    const selectAll = () => {
        if (selectedTesters.size === data.length) setSelectedTesters(new Set());
        else setSelectedTesters(new Set(data.map(t => t.name)));
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between bg-muted/30 p-2 rounded-lg border">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={selectAll} className="gap-2 h-8 text-xs">
                        {selectedTesters.size === data.length ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                        Select All
                    </Button>
                    <span className="text-xs text-muted-foreground border-l pl-2">
                        {selectedTesters.size} selected
                    </span>
                </div>
                <Button size="sm" onClick={handleCopyReminders} disabled={selectedTesters.size === 0} className="gap-2 h-8 text-xs">
                    <Copy className="h-3.5 w-3.5" />
                    Copy Reminders
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full min-h-[400px]">
                <div className="flex flex-col gap-2 rounded-xl bg-muted/10 p-2.5 border border-dashed">
                    <div className="flex items-center gap-2 pb-2 border-b border-dashed mb-1">
                        <div className="p-1 rounded bg-zinc-500/10 text-zinc-500"><Clock className="h-3.5 w-3.5" /></div>
                        <span className="font-semibold text-xs">Not Started</span>
                        <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">{notStarted.length}</Badge>
                    </div>
                    {notStarted.length === 0 && <div className="text-xs text-muted-foreground text-center py-8">Empty</div>}
                    {notStarted.map(t => (
                        <TesterCard key={t.name} tester={t} isSelected={selectedTesters.has(t.name)} onToggle={() => toggleSelection(t.name)} />
                    ))}
                </div>

                <div className="flex flex-col gap-2 rounded-xl bg-blue-500/5 p-2.5 border border-blue-500/10">
                    <div className="flex items-center gap-2 pb-2 border-b border-blue-500/10 mb-1">
                        <div className="p-1 rounded bg-blue-500/10 text-blue-600"><PlayCircle className="h-3.5 w-3.5" /></div>
                        <span className="font-semibold text-xs text-blue-700 dark:text-blue-400">In Progress</span>
                        <Badge className="ml-auto h-5 px-1.5 text-[10px] bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200">{inProgress.length}</Badge>
                    </div>
                    {inProgress.length === 0 && <div className="text-xs text-muted-foreground text-center py-8">Empty</div>}
                    {inProgress.map(t => (
                        <TesterCard key={t.name} tester={t} isSelected={selectedTesters.has(t.name)} onToggle={() => toggleSelection(t.name)} />
                    ))}
                </div>

                <div className="flex flex-col gap-2 rounded-xl bg-emerald-500/5 p-2.5 border border-emerald-500/10">
                    <div className="flex items-center gap-2 pb-2 border-b border-emerald-500/10 mb-1">
                        <div className="p-1 rounded bg-emerald-500/10 text-emerald-600"><CheckCircle className="h-3.5 w-3.5" /></div>
                        <span className="font-semibold text-xs text-emerald-700 dark:text-emerald-400">Completed</span>
                        <Badge className="ml-auto h-5 px-1.5 text-[10px] bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200">{completed.length}</Badge>
                    </div>
                    {completed.length === 0 && <div className="text-xs text-muted-foreground text-center py-8">Empty</div>}
                    {completed.map(t => (
                        <TesterCard key={t.name} tester={t} isSelected={selectedTesters.has(t.name)} onToggle={() => toggleSelection(t.name)} />
                    ))}
                </div>
            </div>
        </div>
    );
}

export type { TesterData, Assignment };
