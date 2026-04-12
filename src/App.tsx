import React, { useState, useEffect, useRef, useMemo } from "react";
import { StudyDocument, UserProfile, StudySession, QuizResult } from "./types";
import { StudyService } from "./services/studyService";
import { LocalDbService } from "./services/localDbService";
import { localDb } from "./services/db";
import ErrorBoundary from "./components/ErrorBoundary";
import { Loader2, Upload, FileText, Clock, BookOpen, Search, LogOut, Play, Pause, CheckCircle, Brain, HelpCircle, ChevronRight, BarChart2, Plus, Target, Calendar, CheckCircle2, XCircle, FolderPlus, Folder, Eye, EyeOff, Minus, Trash2, MessageSquare, Minimize2, Send } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set up PDF worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, subDays, isSameDay } from 'date-fns';

// Components
const FloatingChat = ({ 
  chatHistory, 
  chatInput, 
  setChatInput, 
  handleAsk, 
  isAsking 
}: { 
  chatHistory: { role: "user" | "ai", text: string }[],
  chatInput: string,
  setChatInput: (s: string) => void,
  handleAsk: (e: React.FormEvent) => void,
  isAsking: boolean
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, isOpen]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop for mobile to close on click outside */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/5 z-[-1] sm:hidden"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20, transformOrigin: "bottom right" }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="mb-4 w-[calc(100vw-3rem)] sm:w-[550px] h-[650px] max-h-[calc(100vh-8rem)] bg-white rounded-[40px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] border border-[#E6E6E1] flex flex-col overflow-hidden"
            >
              <div className="p-6 bg-[#5A5A40] text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
                    <Brain className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-serif font-medium text-lg">Vellum Assistant</h3>
                    <p className="text-[10px] opacity-70 uppercase tracking-widest font-bold">AI Study Guide</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <Minimize2 className="w-5 h-5" />
                </button>
              </div>

              <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-[#FDFDFB]"
              >
                {chatHistory.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-30 px-8">
                    <HelpCircle className="w-16 h-16 mb-4 text-[#5A5A40]" />
                    <p className="text-sm font-bold uppercase tracking-widest text-[#5A5A40]">Ask anything</p>
                    <p className="text-xs mt-2 leading-relaxed">I can help summarize, explain complex concepts, or answer specific questions about this document.</p>
                  </div>
                )}
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] p-4 rounded-3xl text-sm ${
                      msg.role === "user" 
                        ? "bg-[#5A5A40] text-white rounded-tr-none shadow-lg shadow-[#5A5A40]/10" 
                        : "bg-white text-[#1A1A1A] border border-[#E6E6E1] rounded-tl-none shadow-sm"
                    }`}>
                      <div className={`prose prose-sm max-w-none prose-p:leading-relaxed prose-headings:mb-2 prose-headings:mt-4 first:prose-headings:mt-0 ${
                        msg.role === "user" ? "prose-invert" : "prose-slate"
                      }`}>
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeKatex]}
                        >
                          {msg.text}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}
                {isAsking && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-[#E6E6E1] p-4 rounded-3xl rounded-tl-none shadow-sm">
                      <Loader2 className="w-4 h-4 animate-spin text-[#5A5A40]" />
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={handleAsk} className="p-4 bg-white border-t border-[#E6E6E1] flex gap-2 shrink-0">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type your question..."
                  className="flex-1 px-6 py-4 bg-[#F5F5F0] rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20 transition-all border border-transparent focus:border-[#E6E6E1]"
                />
                <button 
                  type="submit" 
                  disabled={isAsking || !chatInput.trim()} 
                  className="w-12 h-12 bg-[#5A5A40] text-white rounded-full flex items-center justify-center disabled:opacity-50 hover:bg-[#4A4A30] transition-all shadow-lg shadow-[#5A5A40]/20 shrink-0"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all ${
          isOpen ? "bg-white text-[#5A5A40] border border-[#E6E6E1]" : "bg-[#5A5A40] text-white"
        }`}
      >
        {isOpen ? <Minimize2 className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
      </motion.button>
    </div>
  );
};

const ProgressView = ({ sessions, quizResults, documents }: { sessions: StudySession[], quizResults: QuizResult[], documents: StudyDocument[] }) => {
  const last7Days = eachDayOfInterval({
    start: subDays(new Date(), 6),
    end: new Date(),
  });

  const chartData = last7Days.map(day => {
    const daySessions = sessions.filter(s => s.startTime && isSameDay(new Date(s.startTime), day));
    const dayQuizzes = quizResults.filter(q => q.timestamp && isSameDay(new Date(q.timestamp), day));
    
    return {
      date: format(day, 'MMM dd'),
      minutes: Math.round(daySessions.reduce((acc, s) => acc + s.duration, 0) / 60),
      avgScore: dayQuizzes.length > 0 
        ? Math.round(dayQuizzes.reduce((acc, q) => acc + q.score, 0) / dayQuizzes.length) 
        : 0
    };
  });

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-[32px] border border-[#E6E6E1]">
          <h3 className="text-sm font-semibold text-[#5A5A40] uppercase tracking-widest mb-6">Study Time (Last 7 Days)</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F5F5F0" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#5A5A40' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#5A5A40' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#FFF', borderRadius: '16px', border: '1px solid #E6E6E1', boxShadow: 'none' }}
                  cursor={{ fill: '#F5F5F0' }}
                />
                <Bar dataKey="minutes" fill="#5A5A40" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[32px] border border-[#E6E6E1]">
          <h3 className="text-sm font-semibold text-[#5A5A40] uppercase tracking-widest mb-6">Quiz Performance</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F5F5F0" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#5A5A40' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#5A5A40' }} domain={[0, 100]} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#FFF', borderRadius: '16px', border: '1px solid #E6E6E1', boxShadow: 'none' }}
                />
                <Line type="monotone" dataKey="avgScore" stroke="#5A5A40" strokeWidth={2} dot={{ fill: '#5A5A40' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-[32px] border border-[#E6E6E1]">
        <h3 className="text-sm font-semibold text-[#5A5A40] uppercase tracking-widest mb-6">Document Breakdown</h3>
        <div className="space-y-4">
          {documents.map(doc => {
            const docSessions = sessions.filter(s => s.documentId === doc.id);
            const totalTime = docSessions.reduce((acc, s) => acc + s.duration, 0);
            if (totalTime === 0) return null;
            
            return (
              <div key={doc.id} className="flex items-center justify-between p-4 bg-[#F5F5F0] rounded-2xl">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-[#5A5A40]" />
                  <span className="font-medium text-[#1A1A1A]">{doc.title}</span>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-widest text-[#5A5A40] opacity-50">Time Spent</p>
                    <p className="font-mono font-medium">{Math.round(totalTime / 60)}m</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const Dashboard = ({ user, onSelectDoc }: { user: any, onSelectDoc: (doc: StudyDocument) => void }) => {
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [quizResults, setQuizResults] = useState<QuizResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"library" | "progress">("library");
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [purgeConfirmId, setPurgeConfirmId] = useState<string | null>(null);

  useEffect(() => {
    const subDocs = LocalDbService.observeDocuments(user.uid).subscribe(docs => {
      setDocuments(docs.map(d => ({ ...d, id: d.id?.toString() })));
    });

    const subSessions = LocalDbService.observeSessions(user.uid).subscribe(sess => {
      setSessions(sess.map(s => ({ ...s, id: s.id?.toString() })));
    });

    const subQuizzes = LocalDbService.observeQuizResults(user.uid).subscribe(results => {
      setQuizResults(results.map(r => ({ ...r, id: r.id?.toString() })));
      setLoading(false);
    });

    return () => {
      subDocs.unsubscribe();
      subSessions.unsubscribe();
      subQuizzes.unsubscribe();
    };
  }, [user.uid]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent, isFolder = false) => {
    let files: FileList | null = null;
    if (e && 'target' in e && (e.target as HTMLInputElement).files) {
      files = (e.target as HTMLInputElement).files;
    } else if (e && 'dataTransfer' in e) {
      files = (e as React.DragEvent).dataTransfer.files;
    }
    
    if (!files || files.length === 0) return;

    setUploading(true);
    const fileArray = Array.from(files); // Allow all files
    
    const CHUNK_SIZE = 500000;
    const PREVIEW_LIMIT = 50000;

    for (const file of fileArray) {
      if (file.size > 100 * 1024 * 1024) { 
        alert(`File ${file.name} is too large. Please upload a file smaller than 100MB.`);
        continue;
      }

      try {
        const { text, title, fileData } = await StudyService.extractTextFromFile(file);
        const materials = await StudyService.generateStudyMaterials(text, fileData, (progress) => {
          setUploadProgress(progress);
        });

        try {
          const contentToStore = text || (fileData ? "[Scanned Document - Text extracted by AI]" : "");
          const isLarge = contentToStore.length > CHUNK_SIZE;
          
          let fileChunks: string[] = [];
          const MAX_DOC_SIZE = 500000;
          if (fileData && fileData.length >= MAX_DOC_SIZE) {
            for (let i = 0; i < fileData.length; i += MAX_DOC_SIZE) {
              fileChunks.push(fileData.substring(i, i + MAX_DOC_SIZE));
            }
          }

          let contentChunks: string[] = [];
          if (isLarge) {
            for (let i = 0; i < text.length; i += CHUNK_SIZE) {
              contentChunks.push(text.substring(i, i + CHUNK_SIZE));
            }
          }

          const docData: any = {
            userId: user.uid,
            title,
            fileName: file.name,
            extractedText: isLarge ? contentToStore.substring(0, PREVIEW_LIMIT) + "... [Full text in chunks]" : contentToStore,
            isLarge,
            ...materials,
            totalStudyTime: 0,
            fileChunkCount: fileChunks.length,
            chunkCount: contentChunks.length
          };

          if (fileData && fileData.length < MAX_DOC_SIZE) {
            docData.fileData = fileData;
          }

          await LocalDbService.addDocument(docData, fileChunks, contentChunks);
        } catch (error) {
          console.error("Local DB Write Error:", error);
        }
      } catch (error) {
        console.error("Upload Error:", error);
        const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred.";
        alert(`Failed to process ${file.name}: ${errorMessage}`);
      }
    }
    setUploading(false);
    setUploadProgress(null);
  };

  const handlePurgeContent = async (e: React.MouseEvent | null, docId: string) => {
    if (e) e.stopPropagation();

    try {
      console.log("Purging document:", docId);
      await LocalDbService.purgeDocumentContent(docId);
      console.log("Purge complete");
    } catch (error) {
      console.error("Purge Error:", error);
      alert("Failed to purge document content. Please check console for details.");
    }
  };

  const filteredDocs = documents.filter(doc => 
    !doc.isPurged && (
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.keyConcepts?.some(c => c.concept.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  );

  return (
    <div 
      className={`max-w-6xl mx-auto p-6 transition-all ${isDragging ? "bg-[#5A5A40]/5" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleUpload(e); }}
    >
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-12">
        <div>
          <h2 className="text-4xl font-serif font-medium text-[#1A1A1A]">Your Dashboard</h2>
          <div className="flex gap-6 mt-4">
            {["library", "progress"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`pb-2 text-sm font-medium transition-all relative ${
                  activeTab === tab ? "text-[#1A1A1A]" : "text-[#5A5A40] opacity-50"
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {activeTab === tab && (
                  <motion.div layoutId="dashTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#5A5A40]" />
                )}
              </button>
            ))}
          </div>
        </div>
        
        {activeTab === "library" && (
          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A5A40] opacity-50" />
              <input 
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 bg-white border border-[#E6E6E1] rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20 w-64"
              />
            </div>
            
            <div className="flex flex-col items-end gap-1">
              <div className="flex gap-2">
                <label className="cursor-pointer bg-[#5A5A40] text-white px-6 py-2 rounded-full font-medium hover:bg-[#4A4A30] transition-colors flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  {uploading ? "Processing..." : "Upload PDF"}
                  <input type="file" accept=".pdf" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
                </label>
                
                <label className="cursor-pointer border border-[#5A5A40] text-[#5A5A40] px-6 py-2 rounded-full font-medium hover:bg-[#5A5A40]/5 transition-colors flex items-center gap-2">
                  <Folder className="w-4 h-4" />
                  {uploading ? "..." : "Upload Folder"}
                  <input 
                    type="file" 
                    className="hidden" 
                    {...({ webkitdirectory: "", directory: "" } as any)} 
                    multiple 
                    onChange={(e) => handleUpload(e, true)} 
                    disabled={uploading}
                  />
                </label>
              </div>
              <span className="text-[10px] text-[#5A5A40] opacity-50 uppercase tracking-widest mr-2">Folder drop supported</span>
            </div>
          </div>
        )}
      </header>

      {uploadProgress && (
        <div className="max-w-6xl mx-auto mb-8">
          <div className="bg-white p-6 rounded-[32px] border border-[#5A5A40]/20 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[#5A5A40]">Analyzing Document...</span>
              <span className="text-xs font-mono text-[#5A5A40]">{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</span>
            </div>
            <div className="w-full h-2 bg-[#F5F5F0] rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                className="h-full bg-[#5A5A40]"
              />
            </div>
            <p className="text-[10px] text-[#5A5A40] opacity-50 mt-2 uppercase tracking-widest">
              Processing section {uploadProgress.current} of {uploadProgress.total}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#5A5A40]" />
        </div>
      ) : activeTab === "progress" ? (
        <ProgressView sessions={sessions} quizResults={quizResults} documents={documents} />
      ) : (
        <div className="w-full">
          {filteredDocs.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-[32px] border border-dashed border-[#E6E6E1]">
              <FileText className="w-12 h-12 text-[#5A5A40] opacity-20 mx-auto mb-4" />
              <p className="text-[#5A5A40]">No documents found. Upload your first file to get started!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredDocs.map((doc) => (
                <motion.div
                  key={doc.id}
                  layoutId={doc.id}
                  onClick={() => onSelectDoc(doc)}
                  className="relative bg-white p-6 rounded-[32px] border border-[#E6E6E1] hover:border-[#5A5A40] transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-10 h-10 bg-[#F5F5F0] rounded-xl flex items-center justify-center group-hover:bg-[#5A5A40] transition-colors">
                      <FileText className="w-5 h-5 text-[#5A5A40] group-hover:text-white" />
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="text-xs font-mono text-[#5A5A40] opacity-50">
                        {Math.round(doc.totalStudyTime / 60)}m studied
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setPurgeConfirmId(doc.id!); }}
                          className="p-1.5 text-[#5A5A40] opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
                          title="Purge content to save space"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {purgeConfirmId === doc.id && (
                    <div className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded-[32px] flex flex-col items-center justify-center p-6 z-10 text-center animate-in fade-in zoom-in duration-200">
                      <Trash2 className="w-8 h-8 text-red-500 mb-2" />
                      <p className="text-sm font-semibold text-[#1A1A1A] mb-1">Purge Content?</p>
                      <p className="text-[10px] text-[#5A5A40] mb-4 leading-relaxed">
                        PDF text and AI guides will be deleted. <br/>
                        <span className="font-bold">Study history will be kept.</span>
                      </p>
                      <div className="flex gap-2 w-full max-w-[200px]">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handlePurgeContent(null, doc.id!); setPurgeConfirmId(null); }}
                          className="flex-1 py-2 bg-red-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-red-600 transition-colors"
                        >
                          Purge
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setPurgeConfirmId(null); }}
                          className="flex-1 py-2 bg-[#F5F5F0] text-[#5A5A40] rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-[#E6E6E1] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  <h3 className="text-xl font-serif font-medium text-[#1A1A1A] mb-2 line-clamp-2">{doc.title}</h3>
                  <div className="flex flex-wrap gap-2 mt-4">
                    {doc.keyConcepts?.slice(0, 3).map((c, i) => (
                      <span key={i} className="text-[10px] uppercase tracking-wider font-semibold text-[#5A5A40] bg-[#F5F5F0] px-2 py-1 rounded">
                        {c.concept}
                      </span>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const GuidedReadingView = ({ 
  studyDoc, 
  fullText, 
  user, 
  onBack, 
  onGenerateGuide, 
  isGeneratingGuide, 
  granularity, 
  setGranularity,
  chatInput,
  setChatInput,
  chatHistory,
  isAsking,
  handleAsk
}: { 
  studyDoc: StudyDocument, 
  fullText: string, 
  user: any, 
  onBack: () => void, 
  onGenerateGuide: (g: number) => void, 
  isGeneratingGuide: boolean, 
  granularity: number, 
  setGranularity: (g: number) => void,
  chatInput: string,
  setChatInput: (s: string) => void,
  chatHistory: { role: "user" | "ai", text: string }[],
  isAsking: boolean,
  handleAsk: (e: React.FormEvent) => void
}) => {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [viewMode, setViewMode] = useState<"text" | "pdf">(studyDoc.fileData ? "pdf" : "text");
  const [pdfContainerWidth, setPdfContainerWidth] = useState(800);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pdfContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setPdfContainerWidth(entry.contentRect.width - 48); // Padding
      }
    });
    observer.observe(pdfContainerRef.current);
    return () => observer.disconnect();
  }, [viewMode]);
  const [fontSize, setFontSize] = useState(18);
  const [pdfData, setPdfData] = useState<string | null>(studyDoc.fileData || null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [readingStartTime] = useState(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [lastSavedSeconds, setLastSavedSeconds] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pdfScrollRef = useRef<HTMLDivElement>(null);

  // Periodic auto-save every 30 seconds for Guided Reading
  useEffect(() => {
    const saveInterval = setInterval(async () => {
      const currentElapsed = Math.floor((Date.now() - readingStartTime) / 1000);
      const unsavedSeconds = currentElapsed - lastSavedSeconds;
      
      if (unsavedSeconds >= 30) {
        setLastSavedSeconds(currentElapsed);
        try {
          await LocalDbService.updateDocument(studyDoc.id!, {
            totalStudyTime: (studyDoc.totalStudyTime || 0) + unsavedSeconds
          });
          await LocalDbService.addSession({
            userId: user.uid,
            documentId: studyDoc.id!,
            startTime: new Date(),
            duration: unsavedSeconds,
            notes: "Guided Reading Session"
          });
        } catch (error) {
          console.error("Guided Reading Auto-save Error:", error);
        }
      }
    }, 10000); // Check every 10s if we should save
    
    return () => clearInterval(saveInterval);
  }, [readingStartTime, lastSavedSeconds, studyDoc.id, user.uid]);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!pdfData) {
      setPdfUrl(null);
      return;
    }
    
    try {
      // Clean the base64 string - remove any whitespace or data URI prefix
      const cleanedData = pdfData.replace(/^data:application\/pdf;base64,/, '').replace(/\s/g, '');
      if (!cleanedData) {
        setPdfUrl(null);
        return;
      }
      
      const binaryString = window.atob(cleanedData);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      
      return () => {
        URL.revokeObjectURL(url);
      };
    } catch (e) {
      console.error("Error creating PDF URL from base64:", e);
      setPdfUrl(null);
    }
  }, [pdfData]);

  // Dynamic guidance based on scroll
  const currentGuide = useMemo(() => {
    if (!studyDoc.chunkGuides || studyDoc.chunkGuides.length === 0) return studyDoc.readingGuide;
    const index = Math.min(
      Math.floor((scrollProgress / 100) * studyDoc.chunkGuides.length),
      studyDoc.chunkGuides.length - 1
    );
    return studyDoc.chunkGuides[index];
  }, [scrollProgress, studyDoc.chunkGuides, studyDoc.readingGuide]);

  useEffect(() => {
    const fetchPdfChunks = async () => {
      if (!studyDoc.fileData && studyDoc.id) {
        try {
          const chunks = await LocalDbService.getFileChunks(studyDoc.id);
          if (chunks.length > 0) {
            setPdfData(chunks.join(""));
            setViewMode("pdf");
          }
        } catch (error) {
          console.error("Fetch PDF Chunks Error:", error);
        }
      }
    };
    fetchPdfChunks();
  }, [studyDoc.id, studyDoc.fileData]);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - readingStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [readingStartTime]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const scrollableHeight = target.scrollHeight - target.clientHeight;
    const progress = scrollableHeight > 0 ? (target.scrollTop / scrollableHeight) * 100 : 0;
    setScrollProgress(Math.min(100, Math.max(0, progress)));
  };

  const handlePdfScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const scrollableHeight = target.scrollHeight - target.clientHeight;
    const progress = scrollableHeight > 0 ? (target.scrollTop / scrollableHeight) * 100 : 0;
    setScrollProgress(Math.min(100, Math.max(0, progress)));
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const wordCount = fullText.split(/\s+/).length;
  const wpm = elapsedSeconds > 0 ? Math.round((wordCount * (scrollProgress / 100)) / (elapsedSeconds / 60)) : 0;

  const highlightText = (text: string, highlights: string[]) => {
    if (!highlights || highlights.length === 0) return text;
    
    const sortedHighlights = [...highlights].sort((a, b) => b.length - a.length);
    let result = text;
    sortedHighlights.forEach(h => {
      const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escaped})`, 'gi');
      result = result.replace(regex, '<mark class="bg-[#5A5A40]/20 text-[#1A1A1A] px-1 rounded cursor-pointer hover:bg-[#5A5A40]/40 transition-colors" data-highlight="$1">$1</mark>');
    });
    
    return result;
  };

  return (
    <div className="fixed inset-0 bg-[#F5F5F0] z-50 flex flex-col">
      <header className="h-16 bg-white border-b border-[#E6E6E1] px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-[#F5F5F0] rounded-full transition-colors">
            <ChevronRight className="w-5 h-5 rotate-180 text-[#5A5A40]" />
          </button>
          <h2 className="font-serif font-medium text-[#1A1A1A] truncate max-w-md">{studyDoc.title}</h2>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden xl:flex flex-col gap-1 mr-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#5A5A40] uppercase tracking-widest font-bold">Granularity</span>
                <div className="flex flex-col gap-1">
                  <input 
                    type="range" 
                    min="500" 
                    max="20000" 
                    step="500"
                    value={granularity}
                    onChange={(e) => setGranularity(parseInt(e.target.value))}
                    className="w-24 accent-[#5A5A40]"
                  />
                  <div className="flex justify-between text-[6px] uppercase tracking-tighter opacity-50 font-bold">
                    <span>Max Freq</span>
                    <span>Standard</span>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-[#5A5A40] w-12 text-center">
                  {granularity <= 1000 ? "Every Paragraph" : granularity <= 3000 ? "Every Page" : `~${Math.round(granularity / 3000)}p`}
                </span>
              </div>
          </div>

          <div className="hidden lg:flex items-center gap-4 text-xs font-mono text-[#5A5A40]">
            <div className="flex flex-col items-end">
              <span className="opacity-50 uppercase tracking-widest">Reading Speed</span>
              <span className="font-bold">{wpm} WPM</span>
            </div>
            <div className="w-px h-6 bg-[#E6E6E1]" />
            <div className="flex flex-col items-end">
              <span className="opacity-50 uppercase tracking-widest">Progress</span>
              <span className="font-bold">{Math.round(scrollProgress)}%</span>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-[#F5F5F0] p-1 rounded-lg border border-[#E6E6E1]">
            <button 
              onClick={() => setViewMode("text")}
              className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all ${
                viewMode === "text" ? "bg-white text-[#5A5A40] shadow-sm" : "text-[#5A5A40] opacity-50 hover:opacity-100"
              }`}
            >
              Text View
            </button>
            {pdfData && (
              <button 
                onClick={() => setViewMode("pdf")}
                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all ${
                  viewMode === "pdf" ? "bg-white text-[#5A5A40] shadow-sm" : "text-[#5A5A40] opacity-50 hover:opacity-100"
                }`}
              >
                PDF View
              </button>
            )}
          </div>

          {viewMode === "text" && (
            <div className="flex items-center gap-2 bg-[#F5F5F0] px-3 py-1 rounded-full border border-[#E6E6E1]">
              <button onClick={() => setFontSize(Math.max(12, fontSize - 2))} className="p-1 hover:bg-white rounded transition-colors">
                <Minus className="w-3 h-3 text-[#5A5A40]" />
              </button>
              <span className="text-[10px] font-mono font-bold text-[#5A5A40] w-8 text-center">{fontSize}px</span>
              <button onClick={() => setFontSize(Math.min(32, fontSize + 2))} className="p-1 hover:bg-white rounded transition-colors">
                <Plus className="w-3 h-3 text-[#5A5A40]" />
              </button>
            </div>
          )}

          <button 
            onClick={() => setIsFocusMode(!isFocusMode)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all ${
              isFocusMode ? "bg-[#5A5A40] text-white" : "bg-[#F5F5F0] text-[#5A5A40] hover:bg-[#E6E6E1]"
            }`}
          >
            {isFocusMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {isFocusMode ? "Exit Focus" : "Focus Mode"}
          </button>
          
          <div className="w-px h-4 bg-[#E6E6E1]" />
          <Brain className="w-5 h-5 text-[#5A5A40]" />
        </div>
      </header>

      {/* Progress Bar */}
      <div className="h-1 bg-[#F5F5F0] w-full shrink-0">
        <motion.div 
          className="h-full bg-[#5A5A40]"
          animate={{ width: `${scrollProgress}%` }}
          transition={{ type: "spring", bounce: 0, duration: 0.3 }}
        />
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {viewMode === "pdf" && pdfData ? (
            <div 
              ref={pdfContainerRef}
              className="flex-1 overflow-hidden bg-[#E6E6E1]"
            >
              <div 
                ref={pdfScrollRef}
                onScroll={handlePdfScroll}
                className="h-full overflow-y-auto p-6 custom-scrollbar"
              >
                {pdfUrl && (
                  <Document
                    file={pdfUrl}
                    onLoadSuccess={onDocumentLoadSuccess}
                    onLoadError={(error) => {
                      console.error("PDF Load Error:", error);
                      // If PDF fails, we should allow switching to text
                      if (viewMode === "pdf") setViewMode("text");
                    }}
                    loading={<div className="flex flex-col items-center justify-center h-full gap-4">
                      <Loader2 className="w-8 h-8 animate-spin text-[#5A5A40]" />
                      <p className="text-xs font-mono text-[#5A5A40] animate-pulse uppercase tracking-widest">Loading Document...</p>
                    </div>}
                    noData={<div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
                      <FileText className="w-12 h-12 text-[#5A5A40] opacity-20" />
                      <p className="text-sm font-serif text-[#1A1A1A]">No PDF data available</p>
                    </div>}
                    error={<div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
                      <XCircle className="w-12 h-12 text-red-500 opacity-20" />
                      <div>
                        <p className="text-sm font-serif text-[#1A1A1A]">Failed to load PDF</p>
                        <p className="text-xs text-[#5A5A40] mt-1">The document might be corrupted or too large for the viewer.</p>
                      </div>
                      <button 
                        onClick={() => setViewMode("text")}
                        className="px-4 py-2 bg-[#5A5A40] text-white rounded-full text-xs font-medium"
                      >
                        Switch to Text View
                      </button>
                    </div>}
                  >
                    {Array.from(new Array(numPages), (el, index) => (
                      <Page 
                        key={`page_${index + 1}`} 
                        pageNumber={index + 1} 
                        width={pdfContainerWidth}
                        className="mb-6 shadow-xl mx-auto rounded-lg overflow-hidden"
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                      />
                    ))}
                  </Document>
                )}
              </div>
            </div>
          ) : (
            <div 
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto bg-white scroll-smooth custom-scrollbar"
            >
              <div className="max-w-2xl mx-auto p-12">
                <div 
                  className="prose prose-slate max-w-none text-[#1A1A1A] leading-loose font-serif whitespace-pre-wrap selection:bg-[#5A5A40]/20"
                  style={{ fontSize: `${fontSize}px` }}
                >
                  {fullText}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Guidance Panel */}
        <AnimatePresence>
          {!isFocusMode && (
            <motion.div 
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 384, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="border-l border-[#E6E6E1] bg-[#F5F5F0] overflow-y-auto p-8 shrink-0 custom-scrollbar"
            >
              {!currentGuide ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                  <Brain className="w-12 h-12 text-[#5A5A40] opacity-20" />
                  <div>
                    <h3 className="font-serif font-medium text-[#1A1A1A]">Reading Guide Missing</h3>
                    <p className="text-xs text-[#5A5A40] mt-1">Generate a guide to help you read faster and understand deeper.</p>
                  </div>
                  <button 
                    onClick={() => onGenerateGuide(granularity)}
                    disabled={isGeneratingGuide}
                    className="px-6 py-2 bg-[#5A5A40] text-white rounded-full text-sm font-medium hover:bg-[#4A4A30] transition-all disabled:opacity-50"
                  >
                    {isGeneratingGuide ? "Generating..." : "Generate Guide"}
                  </button>
                </div>
              ) : (
                <div className="space-y-10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Brain className="w-3 h-3 text-[#5A5A40] opacity-50" />
                      <span className="text-[10px] font-bold text-[#5A5A40] opacity-50 uppercase tracking-widest">Adjust Frequency</span>
                    </div>
                    <button 
                      onClick={() => onGenerateGuide(granularity)}
                      disabled={isGeneratingGuide}
                      className="text-[10px] font-bold text-[#5A5A40] hover:underline disabled:opacity-50"
                    >
                      {isGeneratingGuide ? "Updating..." : "Update Guide"}
                    </button>
                  </div>
                  <div className="flex flex-col gap-1 mb-8">
                    <div className="flex items-center gap-2">
                      <input 
                        type="range" 
                        min="500" 
                        max="20000" 
                        step="500"
                        value={granularity}
                        onChange={(e) => setGranularity(parseInt(e.target.value))}
                        className="flex-1 accent-[#5A5A40]"
                      />
                      <span className="text-[10px] font-mono text-[#5A5A40] w-12">
                        {granularity <= 1000 ? "Para" : granularity <= 3000 ? "Page" : `~${Math.round(granularity / 3000)}p`}
                      </span>
                    </div>
                    <div className="flex justify-between text-[8px] uppercase tracking-widest opacity-50 font-bold px-1">
                      <span>Max Frequency</span>
                      <span>Standard</span>
                    </div>
                  </div>

                  <section>
                    <div className="flex items-center gap-2 mb-4">
                      <CheckCircle2 className="w-4 h-4 text-[#5A5A40]" />
                      <h3 className="text-sm font-semibold text-[#5A5A40] uppercase tracking-widest">Key Takeaways</h3>
                    </div>
                    <div className="space-y-3">
                      {currentGuide.keyTakeaways.length > 0 ? currentGuide.keyTakeaways.map((t, i) => (
                        <div key={i} className="flex gap-3 items-start">
                          <div className="w-1.5 h-1.5 bg-[#5A5A40] rounded-full mt-2 shrink-0" />
                          <p className="text-sm text-[#5A5A40]">{t}</p>
                        </div>
                      )) : <p className="text-xs text-[#5A5A40] opacity-50 italic">No key takeaways available.</p>}
                    </div>
                  </section>

                  <section>
                    <div className="flex items-center gap-2 mb-4">
                      <Target className="w-4 h-4 text-[#5A5A40]" />
                      <h3 className="text-sm font-semibold text-[#5A5A40] uppercase tracking-widest">
                        {studyDoc.chunkGuides && studyDoc.chunkGuides.length > 0 ? (
                          <span className="flex items-center gap-2">
                            Section Focus
                            <span className="px-2 py-0.5 bg-[#5A5A40]/10 rounded-full text-[10px] font-mono">
                              {Math.min(Math.floor((scrollProgress / 100) * studyDoc.chunkGuides.length) + 1, studyDoc.chunkGuides.length)} / {studyDoc.chunkGuides.length}
                            </span>
                          </span>
                        ) : "Pre-Reading Focus"}
                      </h3>
                    </div>
                    <div className="space-y-3">
                      {currentGuide.preReadingQuestions.length > 0 ? currentGuide.preReadingQuestions.map((q, i) => (
                        <div key={i} className="p-4 bg-white rounded-2xl border border-[#E6E6E1] text-sm text-[#1A1A1A] shadow-sm">
                          <span className="block text-[10px] font-bold text-[#5A5A40] opacity-30 mb-1">QUESTION {i + 1}</span>
                          {q}
                        </div>
                      )) : <p className="text-xs text-[#5A5A40] opacity-50 italic">No focus questions available for this section.</p>}
                    </div>
                  </section>

                  {/* Guidance Panel Content */}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <FloatingChat 
        chatHistory={chatHistory}
        chatInput={chatInput}
        setChatInput={setChatInput}
        handleAsk={handleAsk}
        isAsking={isAsking}
      />
    </div>
  );
};

const DocumentView = ({ doc: initialDoc, user, onBack }: { doc: StudyDocument, user: any, onBack: () => void }) => {
  const [studyDoc, setStudyDoc] = useState<StudyDocument>(initialDoc);
  const [fullText, setFullText] = useState<string>(initialDoc.extractedText);
  const [isLoadingFullText, setIsLoadingFullText] = useState(false);
  const [isGuidedReading, setIsGuidedReading] = useState(false);
  const [isGeneratingGuide, setIsGeneratingGuide] = useState(false);
  const [granularity, setGranularity] = useState(2000);
  const [activeTab, setActiveTab] = useState<"summary" | "concepts" | "questions">("summary");
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "ai", text: string }[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [isGeneratingMore, setIsGeneratingMore] = useState(false);
  const [topicInput, setTopicInput] = useState("");
  const [isGeneratingTopic, setIsGeneratingTopic] = useState(false);
  const [quizMode, setQuizMode] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [isSubmittingQuiz, setIsSubmittingQuiz] = useState(false);

  useEffect(() => {
    setStudyDoc(initialDoc);
    setFullText(initialDoc.extractedText);
    setChatHistory([]);
    
    if (initialDoc.isLarge && initialDoc.id) {
      loadFullText(initialDoc.id);
    }
  }, [initialDoc]);

  const loadFullText = async (docId: string) => {
    setIsLoadingFullText(true);
    try {
      const chunks = await LocalDbService.getContentChunks(docId);
      if (chunks.length > 0) {
        setFullText(chunks.join(""));
      }
    } catch (error) {
      console.error("Load Full Text Error:", error);
    } finally {
      setIsLoadingFullText(false);
    }
  };

  useEffect(() => {
    let interval: any;
    if (isTimerRunning) {
      interval = setInterval(() => setSeconds(s => s + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  // Auto-start timer on mount
  useEffect(() => {
    setIsTimerRunning(true);
  }, []);

  useEffect(() => {
    let saveInterval: any;
    if (isTimerRunning) {
      saveInterval = setInterval(async () => {
        if (seconds > 0) {
          const currentSeconds = seconds;
          setSeconds(0); // Reset local counter after saving
          try {
            await LocalDbService.updateDocument(studyDoc.id!, {
              totalStudyTime: (studyDoc.totalStudyTime || 0) + currentSeconds
            });
            await LocalDbService.addSession({
              userId: user.uid,
              documentId: studyDoc.id!,
              startTime: new Date(),
              duration: currentSeconds
            });
          } catch (error) {
            console.error("Auto-save Error:", error);
          }
        }
      }, 30000);
    }
    return () => clearInterval(saveInterval);
  }, [isTimerRunning, seconds, studyDoc.id, user.uid]);

  const stopTimer = async () => {
    setIsTimerRunning(false);
    if (seconds > 0) {
      const currentSeconds = seconds;
      setSeconds(0);
      try {
        await LocalDbService.updateDocument(studyDoc.id!, {
          totalStudyTime: (studyDoc.totalStudyTime || 0) + currentSeconds
        });
        await LocalDbService.addSession({
          userId: user.uid,
          documentId: studyDoc.id!,
          startTime: new Date(),
          duration: currentSeconds
        });
      } catch (error) {
        console.error("Error saving session:", error);
      }
    }
  };

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isAsking) return;

    const question = chatInput;
    setChatInput("");
    const newHistory = [...chatHistory, { role: "user" as const, text: question }];
    setChatHistory(newHistory);
    setIsAsking(true);

    try {
      const answer = await StudyService.askQuestion(fullText, question);
      const updatedHistory = [...newHistory, { role: "ai" as const, text: answer }];
      setChatHistory(updatedHistory);
    } catch (error) {
      console.error("Chat Error:", error);
    } finally {
      setIsAsking(false);
    }
  };

  const handleGenerateMore = async () => {
    if (isGeneratingMore) return;
    setIsGeneratingMore(true);
    try {
      const newQuestions = await StudyService.generateMoreQuestions(
        fullText,
        studyDoc.practiceQuestions || []
      );
      
      const updatedQuestions = [...(studyDoc.practiceQuestions || []), ...newQuestions];
      try {
        await LocalDbService.updateDocument(studyDoc.id!, {
          practiceQuestions: updatedQuestions
        });
      } catch (error) {
        console.error("Update Questions Error:", error);
      }
      
      setStudyDoc(prev => ({
        ...prev,
        practiceQuestions: updatedQuestions
      }));
    } catch (error) {
      console.error("Error generating more questions:", error);
    } finally {
      setIsGeneratingMore(false);
    }
  };

  const handleGenerateTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topicInput.trim() || isGeneratingTopic) return;
    setIsGeneratingTopic(true);
    try {
      const newQuestions = await StudyService.generateTopicQuestions(
        fullText,
        topicInput
      );
      
      const updatedQuestions = [...(studyDoc.practiceQuestions || []), ...newQuestions];
      try {
        await LocalDbService.updateDocument(studyDoc.id!, {
          practiceQuestions: updatedQuestions
        });
      } catch (error) {
        console.error("Update Topic Questions Error:", error);
      }
      
      setStudyDoc(prev => ({
        ...prev,
        practiceQuestions: updatedQuestions
      }));
      setTopicInput("");
    } catch (error) {
      console.error("Error generating topic questions:", error);
    } finally {
      setIsGeneratingTopic(false);
    }
  };

  const submitQuiz = async () => {
    if (!studyDoc.practiceQuestions || isSubmittingQuiz) return;
    
    setIsSubmittingQuiz(true);
    let correct = 0;
    studyDoc.practiceQuestions.forEach((q, i) => {
      if (quizAnswers[i]?.toLowerCase().trim() === q.answer.toLowerCase().trim()) {
        correct++;
      }
    });

    const score = Math.round((correct / studyDoc.practiceQuestions.length) * 100);
    
    try {
      if (studyDoc.id) {
        await LocalDbService.addQuizResult({
          userId: user.uid,
          documentId: studyDoc.id,
          score,
          totalQuestions: studyDoc.practiceQuestions.length,
          correctAnswers: correct,
          timestamp: new Date()
        });
      }
      setQuizSubmitted(true);
    } catch (error) {
      console.error("Error in quiz submission:", error);
    } finally {
      setIsSubmittingQuiz(false);
    }
  };

  const handleGenerateGuide = async (selectedGranularity: number) => {
    if (isGeneratingGuide) return;
    setIsGeneratingGuide(true);
    try {
      const materials = await StudyService.generateStudyMaterials(fullText, undefined, undefined, selectedGranularity);
      await LocalDbService.updateDocument(studyDoc.id!, {
        readingGuide: materials.readingGuide,
        chunkGuides: materials.chunkGuides
      });
      setStudyDoc(prev => ({ 
        ...prev, 
        readingGuide: materials.readingGuide, 
        chunkGuides: materials.chunkGuides 
      }));
    } catch (error) {
      console.error("Error generating guide:", error);
    } finally {
      setIsGeneratingGuide(false);
    }
  };

  if (isGuidedReading) {
    return (
      <GuidedReadingView 
        studyDoc={studyDoc} 
        fullText={fullText} 
        user={user}
        onBack={() => setIsGuidedReading(false)} 
        onGenerateGuide={handleGenerateGuide}
        isGeneratingGuide={isGeneratingGuide}
        granularity={granularity}
        setGranularity={setGranularity}
        chatInput={chatInput}
        setChatInput={setChatInput}
        chatHistory={chatHistory}
        isAsking={isAsking}
        handleAsk={handleAsk}
      />
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <button onClick={onBack} className="mb-8 flex items-center gap-2 text-[#5A5A40] hover:text-[#1A1A1A] transition-colors">
        <ChevronRight className="w-4 h-4 rotate-180" />
        Back to Library
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {studyDoc.isPurged && (
            <div className="mb-8 p-6 bg-red-50 border border-red-100 rounded-[32px] flex items-start gap-4">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h4 className="text-red-900 font-bold uppercase tracking-widest text-[10px] mb-1">Content Purged</h4>
                <p className="text-red-700 text-sm leading-relaxed">
                  The stored text and AI guides for this document have been removed to save space. 
                  Your study history and progress are still preserved. To study this document again, 
                  please re-upload the file or re-process the URL.
                </p>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-4xl font-serif font-medium text-[#1A1A1A]">{studyDoc.title}</h2>
            <button 
              onClick={() => setIsGuidedReading(true)}
              disabled={studyDoc.isPurged}
              className="px-6 py-3 bg-[#5A5A40] text-white rounded-full font-medium hover:bg-[#4A4A30] transition-all flex items-center gap-2 shadow-lg shadow-[#5A5A40]/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <BookOpen className="w-4 h-4" />
              Guided Reading
            </button>
          </div>
          
          <div className="flex gap-6 border-b border-[#E6E6E1] mb-8 overflow-x-auto">
            {["summary", "concepts", "questions"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                disabled={studyDoc.isPurged && (tab === "questions")}
                className={`pb-4 text-sm font-medium transition-all relative ${
                  activeTab === tab ? "text-[#1A1A1A]" : "text-[#5A5A40] opacity-50"
                } disabled:opacity-20 disabled:cursor-not-allowed`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {activeTab === tab && (
                  <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#5A5A40]" />
                )}
              </button>
            ))}
          </div>

          <div className="bg-white p-8 rounded-[32px] border border-[#E6E6E1] min-h-[400px]">
            <AnimatePresence mode="wait">
              {activeTab === "summary" && (
                <motion.div key="summary" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <p className="text-[#1A1A1A] leading-relaxed whitespace-pre-wrap">{studyDoc.summary}</p>
                </motion.div>
              )}
              {activeTab === "concepts" && (
                <motion.div key="concepts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                  {studyDoc.keyConcepts?.map((c, i) => (
                    <div key={i} className="border-b border-[#F5F5F0] pb-4 last:border-0">
                      <h4 className="font-serif text-lg font-medium text-[#1A1A1A] mb-1">{c.concept}</h4>
                      <p className="text-[#5A5A40]">{c.definition}</p>
                    </div>
                  ))}
                </motion.div>
              )}
              {activeTab === "questions" && (
                <motion.div key="questions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-serif font-medium text-[#1A1A1A]">Practice Session</h3>
                    <button 
                      onClick={() => {
                        setQuizMode(!quizMode);
                        setQuizSubmitted(false);
                        setQuizAnswers({});
                      }}
                      className={`px-4 py-2 rounded-full text-xs font-medium transition-colors ${
                        quizMode ? "bg-[#5A5A40] text-white" : "bg-[#F5F5F0] text-[#1A1A1A]"
                      }`}
                    >
                      {quizMode ? "Exit Quiz Mode" : "Enter Quiz Mode"}
                    </button>
                  </div>

                  {studyDoc.practiceQuestions?.map((q, i) => (
                    <div key={i} className="space-y-3 p-6 bg-[#F5F5F0]/50 rounded-3xl border border-[#F5F5F0]">
                      <div className="flex gap-3">
                        <span className="w-6 h-6 bg-[#F5F5F0] rounded-full flex items-center justify-center text-xs font-bold text-[#5A5A40]">
                          {i + 1}
                        </span>
                        <p className="font-medium text-[#1A1A1A]">{q.question}</p>
                      </div>
                      
                      {quizMode ? (
                        <div className="ml-9 space-y-4">
                          {q.type === "multiple-choice" || q.type === "true-false" ? (
                            <div className="grid grid-cols-1 gap-2">
                              {q.options?.map((opt, j) => {
                                const isSelected = quizAnswers[i] === opt;
                                const isCorrect = opt === q.answer;
                                return (
                                  <button 
                                    key={j} 
                                    type="button"
                                    onClick={() => !quizSubmitted && setQuizAnswers(prev => ({ ...prev, [i]: opt }))}
                                    className={`text-left p-3 rounded-xl border transition-all text-sm flex items-center justify-between cursor-pointer relative z-10 ${
                                      isSelected 
                                        ? "bg-[#5A5A40] text-white border-[#5A5A40]" 
                                        : "bg-white border-[#E6E6E1] hover:bg-[#F5F5F0]"
                                    } ${quizSubmitted && isCorrect ? "ring-2 ring-green-500" : ""}`}
                                  >
                                    <span>{opt}</span>
                                    {quizSubmitted && isCorrect && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                                    {quizSubmitted && isSelected && !isCorrect && <XCircle className="w-4 h-4 text-red-400" />}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="relative">
                              <input 
                                type={q.type === "numeric" ? "number" : "text"}
                                disabled={quizSubmitted}
                                value={quizAnswers[i] || ""}
                                onChange={(e) => setQuizAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                                placeholder={q.type === "numeric" ? "Enter a number..." : "Type your answer..."}
                                className={`w-full px-4 py-3 bg-white border rounded-xl text-sm focus:outline-none transition-all ${
                                  quizSubmitted 
                                    ? quizAnswers[i]?.toLowerCase().trim() === q.answer.toLowerCase().trim()
                                      ? "border-green-500 bg-green-50"
                                      : "border-red-500 bg-red-50"
                                    : "border-[#E6E6E1]"
                                }`}
                              />
                              {quizSubmitted && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                  {quizAnswers[i]?.toLowerCase().trim() === q.answer.toLowerCase().trim() ? (
                                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                                  ) : (
                                    <XCircle className="w-5 h-5 text-red-500" />
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          {quizSubmitted && (
                            <div className={`p-4 rounded-2xl text-sm ${
                              quizAnswers[i]?.toLowerCase().trim() === q.answer.toLowerCase().trim()
                                ? "bg-green-50 text-green-700"
                                : "bg-red-50 text-red-700"
                            }`}>
                              <span className="font-semibold">Correct Answer:</span> {q.answer}
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          {(q.type === "multiple-choice" || q.type === "true-false") && (
                            <div className="grid grid-cols-1 gap-2 ml-9">
                              {q.options?.map((opt, j) => (
                                <button 
                                  key={j} 
                                  type="button"
                                  onClick={() => setQuizAnswers(prev => ({ ...prev, [i]: opt }))}
                                  className={`text-left p-3 rounded-xl border transition-all text-sm cursor-pointer ${
                                    quizAnswers[i] === opt 
                                      ? "bg-[#5A5A40]/10 border-[#5A5A40] text-[#1A1A1A]" 
                                      : "bg-white border-[#E6E6E1] hover:bg-[#F5F5F0]"
                                  }`}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          )}
                          <details className="ml-9 group">
                            <summary className="text-xs font-semibold text-[#5A5A40] cursor-pointer hover:underline uppercase tracking-wider">Show Answer</summary>
                            <div className="mt-2 p-4 bg-[#F5F5F0] rounded-2xl text-sm text-[#1A1A1A]">
                              {q.answer}
                            </div>
                          </details>
                        </>
                      )}
                    </div>
                  ))}

                  {quizMode && !quizSubmitted && (
                    <button 
                      onClick={submitQuiz}
                      disabled={isSubmittingQuiz}
                      className="w-full py-4 bg-[#5A5A40] text-white rounded-3xl font-medium hover:bg-[#4A4A30] transition-colors flex items-center justify-center gap-2"
                    >
                      {isSubmittingQuiz ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Submitting...
                        </>
                      ) : "Submit Quiz"}
                    </button>
                  )}
                  
                  {!quizMode && (
                    <div className="space-y-6 pt-8 border-t border-[#F5F5F0]">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button
                          onClick={handleGenerateMore}
                          disabled={isGeneratingMore}
                          className="py-4 border-2 border-dashed border-[#E6E6E1] rounded-3xl text-[#5A5A40] hover:bg-[#F5F5F0] transition-all flex items-center justify-center gap-2 font-medium text-sm"
                        >
                          {isGeneratingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                          More General Questions
                        </button>
                        
                        <form onSubmit={handleGenerateTopic} className="flex gap-2">
                          <input 
                            type="text"
                            value={topicInput}
                            onChange={(e) => setTopicInput(e.target.value)}
                            placeholder="Enter specific topic..."
                            className="flex-1 px-4 py-2 bg-[#F5F5F0] rounded-3xl text-sm border border-[#E6E6E1] focus:outline-none"
                          />
                          <button 
                            type="submit"
                            disabled={isGeneratingTopic}
                            className="px-4 py-2 bg-[#5A5A40] text-white rounded-3xl text-xs font-medium disabled:opacity-50"
                          >
                            {isGeneratingTopic ? <Loader2 className="w-4 h-4 animate-spin" /> : "Target Topic"}
                          </button>
                        </form>
                      </div>
                      <p className="text-center text-[10px] text-[#5A5A40] opacity-50 uppercase tracking-widest">
                        Generate questions for the whole document or a specific section
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[32px] border border-[#E6E6E1] text-center">
            <h3 className="text-sm font-semibold text-[#5A5A40] uppercase tracking-widest mb-4">Study Timer</h3>
            <div className="text-5xl font-mono font-light text-[#1A1A1A] mb-6">
              {Math.floor(seconds / 60).toString().padStart(2, '0')}:
              {(seconds % 60).toString().padStart(2, '0')}
            </div>
            <div className="flex gap-3">
              {!isTimerRunning ? (
                <button
                  onClick={() => setIsTimerRunning(true)}
                  className="flex-1 py-3 bg-[#5A5A40] text-white rounded-full font-medium flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4" /> Start
                </button>
              ) : (
                <button
                  onClick={() => setIsTimerRunning(false)}
                  className="flex-1 py-3 bg-[#E6E6E1] text-[#1A1A1A] rounded-full font-medium flex items-center justify-center gap-2"
                >
                  <Pause className="w-4 h-4" /> Pause
                </button>
              )}
              <button
                onClick={stopTimer}
                className="p-3 border border-[#E6E6E1] rounded-full hover:bg-[#F5F5F0] transition-colors"
                title="Save Session"
              >
                <CheckCircle className="w-5 h-5 text-[#5A5A40]" />
              </button>
            </div>
          </div>

          <div className="bg-[#F5F5F0] p-8 rounded-[32px] border border-[#E6E6E1]">
            <h3 className="text-sm font-semibold text-[#5A5A40] uppercase tracking-widest mb-4">Stats</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[#5A5A40]">Total Studied</span>
                <span className="font-mono font-medium">{Math.round(studyDoc.totalStudyTime / 60)}m</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[#5A5A40]">Concepts</span>
                <span className="font-mono font-medium">{studyDoc.keyConcepts?.length || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[#5A5A40]">Questions</span>
                <span className="font-mono font-medium">{studyDoc.practiceQuestions?.length || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <FloatingChat 
        chatHistory={chatHistory}
        chatInput={chatInput}
        setChatInput={setChatInput}
        handleAsk={handleAsk}
        isAsking={isAsking}
      />
    </div>
  );
};

export default function App() {
  const [user] = useState<any>({ uid: "local-user", email: "local@study.companion" });
  const [selectedDoc, setSelectedDoc] = useState<StudyDocument | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Test connection to local database
    const testConnection = async () => {
      try {
        await localDb.documents.count();
        console.log("Local database connection verified");
      } catch (error) {
        console.error("Local database connection error:", error);
      }
    };
    testConnection();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F0]">
        <Loader2 className="w-8 h-8 animate-spin text-[#5A5A40]" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#F5F5F0]">
        <nav className="border-b border-[#E6E6E1] bg-white px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setSelectedDoc(null)}>
              <Brain className="w-6 h-6 text-[#5A5A40]" />
              <h1 className="text-xl font-serif font-medium text-[#1A1A1A]">Vellum</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-[#5A5A40] hidden sm:inline">Local Mode</span>
            </div>
          </div>
        </nav>

        <main className="py-8">
          {selectedDoc ? (
            <DocumentView doc={selectedDoc} user={user} onBack={() => setSelectedDoc(null)} />
          ) : (
            <Dashboard user={user} onSelectDoc={setSelectedDoc} />
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}
