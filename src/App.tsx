/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from "react";
import { IoChatboxEllipsesOutline, IoWarningOutline } from "react-icons/io5";
import { MdCancel, MdTranslate, MdOutlineSend } from "react-icons/md";
import { PiLightningLight, PiSparkle } from "react-icons/pi";
import { BiChevronDown, BiLoaderCircle } from "react-icons/bi";

interface Message {
  id: string;
  text: string;
  language: string | null;
  summary?: string;
  translations: Record<string, string>;
}

interface ChromeAI {
  languageDetector: unknown;
  translator: unknown;
  summarizer: unknown;
}

interface WindowWithAI extends Window {
  ai?: ChromeAI;
}

const languages = [
  { code: "en", name: "English" },
  { code: "pt", name: "Portuguese" },
  { code: "es", name: "Spanish" },
  { code: "ru", name: "Russian" },
  { code: "tr", name: "Turkish" },
  { code: "fr", name: "French" },
];

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isAIAvailable, setIsAIAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isTranslating, setIsTranslating] = useState<Record<string, boolean>>(
    {}
  );
  const [isSummarizing, setIsSummarizing] = useState<Record<string, boolean>>(
    {}
  );

  useEffect(() => {
    // Check if Chrome AI APIs are available using correct patterns
    const checkAPIAvailability = async () => {
      try {
        const summarizer = "ai" in window && "summarizer" in (window as any).ai;
        const languageDetector =
          "ai" in window && "languageDetector" in (window as any).ai;
        const translator = "ai" in window && "translator" in (window as any).ai;

        if (summarizer && languageDetector && translator) {
          setIsAIAvailable(true);
        } else {
          setIsAIAvailable(false);
          const missing = [];
          if (!summarizer) missing.push("Summarizer API");
          if (!languageDetector) missing.push("Language Detector API");
          if (!translator) missing.push("Translator API");

          setError(
            `Some Chrome AI APIs are not available: ${missing.join(
              ", "
            )}. Please make sure you are using Chrome with experimental AI features enabled.`
          );
        }
      } catch (error) {
        console.error("API availability check failed:", error);
        setIsAIAvailable(false);
        setError(
          "Failed to detect Chrome AI APIs. Please make sure you are using Chrome with experimental AI features enabled."
        );
      }
    };

    checkAPIAvailability();
  }, []);

  useEffect(() => {
    // Scroll to bottom whenever messages change
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const detectLanguage = async (text: string): Promise<string> => {
    try {
      if (
        !(
          "ai" in window &&
          "languageDetector" in ((window as WindowWithAI).ai as ChromeAI)
        )
      ) {
        throw new Error("Language detection API not available");
      }

      // Get capabilities
      const languageDetectorCapabilities = await (
        window as any
      ).ai.languageDetector.capabilities();
      const canDetect = languageDetectorCapabilities.capabilities;

      if (canDetect === "no") {
        throw new Error("Language detection not available on this device");
      }

      // Create detector instance
      let detector;
      if (canDetect === "readily") {
        detector = await (window as any).ai.languageDetector.create();
      } else {
        detector = await (window as any).ai.languageDetector.create({
          monitor(m: {
            addEventListener: (arg0: string, arg1: (e: any) => void) => void;
          }) {
            m.addEventListener("downloadprogress", (e) => {
              console.log(`Downloaded ${e.loaded} of ${e.total} bytes.`);
            });
          },
        });
        await detector.ready;
      }

      // Use the detector instance to detect language
      const results = await detector.detect(text);

      // Get the most likely language
      if (results && results.length > 0) {
        return results[0].detectedLanguage || "unknown";
      }

      return "unknown";
    } catch (error) {
      console.error("Language detection failed:", error);
      setError(`Language detection failed: ${(error as Error).message}`);
      return "unknown";
    }
  };

  const summarizeText = async (messageId: string, text: string) => {
    setIsSummarizing((prev) => ({ ...prev, [messageId]: true }));
    setError(null);

    try {
      if (!("ai" in window && "summarizer" in (window as any).ai)) {
        throw new Error(
          "Summarization is not available on this device. Please try again later or use a different device."
        );
      }

      const capabilities = await (window as any).ai.summarizer.capabilities();
      if (capabilities.available === "no") {
        throw new Error(
          "Summarization is not available on this device. Please try again later or use a different device."
        );
      }

      const options = {
        type: "key-points",
        format: "markdown",
        length: "medium",
      };

      const summarizer = await (window as any).ai.summarizer.create(options);
      const result = await summarizer.summarize(text);

      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === messageId ? { ...msg, summary: result } : msg
        )
      );
    } catch (error) {
      console.error("Summarization failed:", error);
      setError(`Summarization failed: ${(error as Error).message}`);
    } finally {
      setIsSummarizing((prev) => ({ ...prev, [messageId]: false }));
    }
  };

  const translateText = async (
    messageId: string,
    text: string,
    targetLanguage: string
  ) => {
    // setIsTranslating((prev) => ({ ...prev, [messageId]: true }));
    setError(null);

    try {
      if (!("ai" in window && "translator" in (window as any).ai)) {
        throw new Error("Translation API not available");
      }

      const message = messages.find((msg) => msg.id === messageId);
      if (!message || !message.language) {
        throw new Error("Source language not detected for this message");
      }

      const sourceLanguage = message.language;

      const translatorCapabilities = await (
        window as any
      ).ai.translator.capabilities();
      const isAvailable = translatorCapabilities.languagePairAvailable(
        sourceLanguage,
        targetLanguage
      );

      if (isAvailable === "no") {
        throw new Error(
          `Translation from ${displayLanguageName(
            sourceLanguage
          )} to ${displayLanguageName(targetLanguage)} is not supported.`
        );
      }

      const translator = await (window as any).ai.translator.create({
        sourceLanguage,
        targetLanguage,
      });

      const result = await translator.translate(text);

      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                translations: {
                  ...msg.translations,
                  [targetLanguage]: result,
                },
              }
            : msg
        )
      );
    } catch (error) {
      console.error("Translation failed:", error);
      setError(`Translation failed: ${(error as Error).message}`);
    } finally {
      setIsTranslating((prev) => ({ ...prev, [messageId]: false }));
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    setIsSending(true);
    setError(null);

    try {
      const messageId = Date.now().toString();
      const language = await detectLanguage(inputText);

      const newMessage: Message = {
        id: messageId,
        text: inputText,
        language,
        translations: {},
      };

      setMessages((prev) => [...prev, newMessage]);
      setInputText("");
    } catch (error) {
      setError(`Failed to process message: ${(error as Error).message}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const displayLanguageName = (code: string | null): string => {
    if (!code) return "Unknown";
    const language = languages.find((lang) => lang.code === code);
    return language ? language.name : code;
  };

  if (isAIAvailable === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50">
        <div className="p-8 bg-white rounded-xl shadow-lg">
          <div className="flex items-center space-x-3">
            <div className="w-5 h-5 rounded-full bg-indigo-500 animate-pulse"></div>
            <span className="text-xl font-medium text-gray-800">
              Checking AI API availability...
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (isAIAvailable === false) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50">
        <div className="p-8 bg-white rounded-xl shadow-lg max-w-lg w-full">
          <div className="flex items-center gap-3 text-red-500 mb-5">
            <IoWarningOutline className="size-7" />
            <h2 className="text-2xl font-bold">Chrome AI APIs Not Available</h2>
          </div>
          <p className="mb-5 text-gray-700">
            This application requires Chrome's experimental AI APIs to function
            properly.
          </p>
          <div className="bg-gray-50 p-5 rounded-lg mb-5 border border-gray-200">
            <h3 className="font-bold mb-3 text-lg">
              To enable the required features:
            </h3>
            <ol className="list-decimal list-inside space-y-3">
              <li className="text-gray-800">
                Open Chrome and navigate to{" "}
                <code className="bg-gray-100 px-2 py-1 rounded text-indigo-600 font-mono">
                  chrome://flags
                </code>
              </li>
              <li className="text-gray-800">
                Search for and enable the following flags:
                <ul className="list-disc list-inside ml-5 mt-2 space-y-1.5">
                  <li>
                    <code className="bg-gray-100 px-2 py-1 rounded text-indigo-600 font-mono">
                      #language-detection-api
                    </code>
                  </li>
                  <li>
                    <code className="bg-gray-100 px-2 py-1 rounded text-indigo-600 font-mono">
                      #translation-api
                    </code>
                  </li>
                  <li>
                    <code className="bg-gray-100 px-2 py-1 rounded text-indigo-600 font-mono">
                      #summarization-api-for-gemini-nano
                    </code>
                  </li>
                </ul>
              </li>
              <li className="text-gray-800">Restart your browser</li>
              <li className="text-gray-800">Refresh this page</li>
            </ol>
          </div>
          <p className="text-sm text-gray-500">Error details: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-indigo-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-md p-4 border-b border-indigo-100">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
          <div className="flex items-center gap-2">
            <PiSparkle className="text-indigo-600 size-6" />
            <h1 className="text-xl font-bold text-gray-800">
              AI Text Processor
            </h1>
          </div>

          <div>
            <span className="inline-flex gap-1.5 items-center px-3.5 py-1.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
              <span className="size-2 bg-green-500 rounded-full animate-pulse" />
              AI APIs Connected
            </span>
          </div>
        </div>
      </header>

      {/* Chat area */}
      <main className="flex-1 overflow-auto p-5 max-w-5xl mx-auto w-full">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col gap-4 items-center justify-center text-center text-gray-400 select-none">
            <div className="w-24 h-24 rounded-full bg-white shadow-md flex items-center justify-center">
              <IoChatboxEllipsesOutline className="size-12 text-indigo-300" />
            </div>
            <span className="flex flex-col gap-1">
              <p className="text-xl md:text-2xl font-medium text-gray-600">
                No messages yet
              </p>
              <p className="text-sm md:text-base text-gray-500">
                Type something to start processing with AI
              </p>
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {messages.map((message) => (
              <div
                key={message.id}
                className="bg-white rounded-xl shadow-sm p-5 border border-gray-100 hover:shadow-md transition-shadow"
              >
                <div className="mb-3">
                  <p className="text-gray-800 leading-relaxed">
                    {message.text}
                  </p>
                  <div className="mt-2 text-xs text-gray-500 flex items-center">
                    <span className="bg-indigo-50 px-2 py-1 rounded-md text-indigo-700">
                      Detected: {displayLanguageName(message.language)}
                    </span>
                  </div>
                </div>

                <div className="space-y-4 mt-4">
                  {/* Summarize button (only show for English text over 150 chars) */}
                  {message.language === "en" &&
                    message.text.length > 150 &&
                    !message.summary && (
                      <button
                        onClick={() => summarizeText(message.id, message.text)}
                        className="inline-flex items-center px-4 py-2 border border-indigo-200 text-sm font-medium rounded-lg text-indigo-700 bg-indigo-50 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                        aria-label="Summarize text"
                        disabled={isSummarizing[message.id]}
                      >
                        {isSummarizing[message.id] ? (
                          <BiLoaderCircle className="animate-spin size-5 mr-2" />
                        ) : (
                          <PiLightningLight className="size-4 mr-2" />
                        )}
                        {isSummarizing[message.id]
                          ? "Summarizing..."
                          : "Summarize with AI"}
                      </button>
                    )}

                  {/* Display summary if available */}
                  {message.summary && (
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                      <div className="flex items-center text-xs font-medium text-blue-700 mb-2">
                        <PiLightningLight className="size-4 mr-1.5" />
                        AI Summary
                      </div>
                      <p className="text-sm text-gray-800 leading-relaxed">
                        {message.summary}
                      </p>
                    </div>
                  )}

                  {/* Translation selector */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center">
                      <div className="relative">
                        <BiChevronDown className="absolute top-0 bottom-0 w-5 h-5 my-auto right-3" />
                        <select
                          className="block pl-3 pr-10 py-2 text-sm border border-gray-200 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-lg bg-white shadow-sm appearance-none"
                          aria-label="Select language for translation"
                          onChange={(e) => {
                            const targetLang = e.target.value;
                            if (
                              targetLang &&
                              !message.translations[targetLang]
                            ) {
                              setIsTranslating((prev) => ({
                                ...prev,
                                [message.id]: true,
                              }));
                              setTimeout(() => {
                                translateText(
                                  message.id,
                                  message.text,
                                  targetLang
                                );
                              }, 10);
                            }
                          }}
                          value=""
                        >
                          <option value="" disabled>
                            Translate to...
                          </option>
                          {languages.map((lang) => (
                            <option
                              key={lang.code}
                              value={lang.code}
                              disabled={
                                message.language === lang.code ||
                                Boolean(message.translations[lang.code])
                              }
                            >
                              {lang.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {isTranslating[message.id] && (
                        <BiLoaderCircle className="animate-spin size-5 ml-2 text-indigo-600" />
                      )}
                    </div>
                  </div>

                  {/* Display translations */}
                  {Object.entries(message.translations).length > 0 && (
                    <div className="space-y-3 mt-3">
                      {Object.entries(message.translations).map(
                        ([langCode, translation]) => (
                          <div
                            key={langCode}
                            className="bg-purple-50 rounded-lg p-4 border border-purple-100"
                          >
                            <div className="flex items-center text-xs font-medium text-purple-700 mb-2">
                              <MdTranslate className="size-4 mr-1.5" />
                              {displayLanguageName(langCode)} Translation
                              {/* removed this since I've added one next to the language select */}
                              {/* {isTranslating[message.id] && (
                                <BiLoaderCircle className="animate-spin size-5 ml-2" />
                              )} */}
                            </div>
                            <p className="text-sm text-gray-800 leading-relaxed">
                              {translation}
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Error display */}
      {error && (
        <div
          className="fixed top-5 right-5 max-w-sm bg-red-50 border border-red-200 text-red-800 px-5 py-4 rounded-lg shadow-lg"
          role="alert"
        >
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <MdCancel className="size-5 text-red-500" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium">{error}</p>
              <button
                onClick={() => setError(null)}
                className="mt-2 text-xs font-medium text-red-600 hover:text-red-800 underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input area */}
      <footer className="bg-white border-t border-indigo-100 p-5 drop-shadow-lg">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-end gap-3">
            <div className="flex-1 min-h-[80px] relative">
              <textarea
                id="message-input"
                rows={3}
                className="block p-4 w-full rounded-xl border border-gray-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 min-h-[80px] max-h-[150px] resize-y outline-none"
                placeholder="Type your message here..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isSending || !isAIAvailable}
                aria-label="Message input"
              />
            </div>
            <button
              className={`inline-flex items-center justify-center p-3.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                isSending || !inputText.trim()
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md hover:shadow-lg transition-all"
              }`}
              disabled={isSending || !inputText.trim()}
              onClick={handleSendMessage}
              aria-label="Send message"
            >
              {isSending ? (
                <BiLoaderCircle className="animate-spin size-6 text-white" />
              ) : (
                <MdOutlineSend className="size-5" />
              )}
            </button>
          </div>
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2 md:gap-6 justify-between">
            <p className="text-xs text-gray-500 leading-loose">
              Press{" "}
              <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-semibold text-gray-800 border border-gray-200">
                Enter
              </kbd>{" "}
              to send,{" "}
              <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-semibold text-gray-800 border border-gray-200">
                Shift+Enter
              </kbd>{" "}
              for new line
            </p>
            <p className="text-xs text-indigo-600">Powered by Chrome AI APIs</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
