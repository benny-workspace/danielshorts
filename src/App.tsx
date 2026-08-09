import {
  ARCHETYPES,
  getArchetype,
  isArchetypeId,
  type ArchetypeId,
} from '@shared/archetypes';
import { QUESTIONS, scoreQuiz } from '@shared/questions';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccountSheet } from './components/Account';
import { Footer, Header, Proof } from './components/Chrome';
import { Landing } from './components/Landing';
import { Offers } from './components/Offers';
import { OptIn } from './components/OptIn';
import { OrderStatusPanel } from './components/OrderStatus';
import { Quiz } from './components/Quiz';
import { Result } from './components/Result';
import {
  Atmosphere,
  ToastProvider,
  usePetals,
  useToast,
} from './components/primitives';
import { getConfig, saveQuizResult, type AppConfig } from './lib/api';
import {
  getFavorites,
  getSession,
  removeFavorite,
  saveSession,
  toggleFavorite,
  type Favorite,
} from './lib/storage';

type Stage = 'landing' | 'quiz' | 'optin' | 'result';

/** Brand rose, used everywhere outside a personalised result. */
const BRAND_ACCENT = '226 86 110';

interface CheckoutReturn {
  orderId: string;
  /** Stripe's session id, used to recover the order if the webhook lags. */
  sessionId: string | null;
  cancelled: boolean;
}

/** Reads and then clears the query params Stripe and the magic link send us. */
function readReturnState(): {
  checkout: CheckoutReturn | null;
  archetype: ArchetypeId | null;
  auth: string | null;
} {
  if (typeof window === 'undefined') {
    return { checkout: null, archetype: null, auth: null };
  }

  const params = new URLSearchParams(window.location.search);
  const checkoutState = params.get('checkout');
  const orderId = params.get('order');
  // Stripe substitutes this into the success URL. It is what lets the success
  // screen recover a paid order the server has not caught up with yet.
  const sessionId = params.get('session_id');
  const archetype = params.get('archetype');
  const auth = params.get('auth');

  if (checkoutState || archetype || auth) {
    window.history.replaceState({}, '', window.location.pathname);
  }

  return {
    checkout:
      checkoutState && orderId
        ? { orderId, sessionId, cancelled: checkoutState === 'cancelled' }
        : null,
    archetype: isArchetypeId(archetype) ? archetype : null,
    auth,
  };
}

function AppShell() {
  const toast = useToast();
  const petals = usePetals();
  const returnState = useRef(readReturnState());

  const [stage, setStage] = useState<Stage>(() =>
    returnState.current.checkout || returnState.current.archetype ? 'result' : 'landing',
  );
  const [answers, setAnswers] = useState<Array<ArchetypeId | null>>(
    () => Array(QUESTIONS.length).fill(null),
  );
  const [winner, setWinner] = useState<ArchetypeId>(
    () => returnState.current.archetype ?? 'best_friend',
  );
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string>('');
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutReturn | null>(
    () => returnState.current.checkout,
  );

  const archetype = getArchetype(winner);
  const score = useMemo(() => scoreQuiz(answers), [answers]);

  /* --------------------------------------------------------------- boot */

  useEffect(() => {
    setFavorites(getFavorites());

    const stored = getSession();
    if (stored.email) setEmail(stored.email);
    // Restore a previous result so returning from Stripe shows the right archetype.
    if (stored.answers?.length) setAnswers(stored.answers);
    if (stored.winner && !returnState.current.archetype) setWinner(stored.winner);
    if (stored.attemptId) setAttemptId(stored.attemptId);

    getConfig()
      .then(setConfig)
      .catch(() => setConfig(null));

    if (returnState.current.auth === 'success') {
      toast('You are signed in.');
      setLibraryOpen(true);
    }
    if (returnState.current.auth === 'expired') {
      toast('That sign-in link has expired. Request a new one.', 'error');
      setLibraryOpen(true);
    }
  }, [toast]);

  /*
   * Re-tint the page to the reader's archetype, but only once they have one.
   * Before that the brand rose is used — otherwise the landing page would wear
   * the default archetype's accent, which is not the brand colour.
   */
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--accent',
      stage === 'result' ? archetype.accent : BRAND_ACCENT,
    );
  }, [archetype.accent, stage]);

  /* --------------------------------------------------------------- flow */

  const startQuiz = useCallback(() => {
    setAnswers(Array(QUESTIONS.length).fill(null));
    setStage('quiz');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const answerQuestion = useCallback((index: number, choice: ArchetypeId) => {
    setAnswers((current) => {
      const next = [...current];
      next[index] = choice;
      return next;
    });
  }, []);

  const finishQuiz = useCallback(() => {
    const filled = answers.filter(Boolean) as ArchetypeId[];
    const result = scoreQuiz(filled);
    setWinner(result.winner);
    saveSession({ answers: filled, winner: result.winner });
    setStage('optin');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [answers]);

  const revealResult = useCallback(() => {
    setStage('result');
    window.scrollTo({ top: 0, behavior: 'auto' });
    window.setTimeout(() => petals(), 400);
  }, [petals]);

  const submitOptIn = useCallback(
    async (submittedEmail: string, submittedName: string) => {
      setSaving(true);
      setEmail(submittedEmail);
      setName(submittedName);
      saveSession({ email: submittedEmail });

      const filled = answers.filter(Boolean) as ArchetypeId[];

      try {
        const saved = await saveQuizResult({
          answers: filled,
          winningArchetype: winner,
          email: submittedEmail,
          name: submittedName || undefined,
        });
        setAttemptId(saved.attemptId);
        saveSession({ attemptId: saved.attemptId });
      } catch {
        // Persistence is a nice-to-have; never block the reveal on it.
        toast('We could not save your result, but here it is.', 'error');
      } finally {
        setSaving(false);
        revealResult();
      }
    },
    [answers, winner, revealResult, toast],
  );

  const skipOptIn = useCallback(() => {
    const filled = answers.filter(Boolean) as ArchetypeId[];
    void saveQuizResult({ answers: filled, winningArchetype: winner })
      .then((saved) => {
        setAttemptId(saved.attemptId);
        saveSession({ attemptId: saved.attemptId });
      })
      .catch(() => undefined);
    revealResult();
  }, [answers, winner, revealResult]);

  const onToggleFavorite = useCallback(() => {
    const next = toggleFavorite(winner);
    setFavorites(next);
    toast(
      next.some((favorite) => favorite.id === winner)
        ? `${ARCHETYPES[winner].shortTitle} saved to your library.`
        : 'Removed from your library.',
    );
  }, [winner, toast]);

  const goHome = useCallback(() => {
    setStage('landing');
    setCheckout(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  /* ---------------------------------------------------------------- ui */

  return (
    <div className="relative min-h-screen">
      <Atmosphere />

      <Header
        onHome={goHome}
        onOpenLibrary={() => setLibraryOpen(true)}
        savedCount={favorites.length}
      />

      <main className="relative z-10">
        {checkout ? (
          <OrderStatusPanel
            orderId={checkout.orderId}
            sessionId={checkout.sessionId}
            cancelled={checkout.cancelled}
            onDismiss={() => setCheckout(null)}
          />
        ) : null}

        {stage === 'landing' ? <Landing onStart={startQuiz} /> : null}

        {stage === 'quiz' ? (
          <Quiz
            answers={answers}
            onAnswer={answerQuestion}
            onComplete={finishQuiz}
            onExit={goHome}
          />
        ) : null}

        {stage === 'optin' ? (
          <OptIn
            archetype={archetype}
            onSubmit={submitOptIn}
            onSkip={skipOptIn}
            submitting={saving}
          />
        ) : null}

        {stage === 'result' ? (
          <>
            <Result
              archetype={archetype}
              score={score}
              favorited={favorites.some((favorite) => favorite.id === winner)}
              onToggleFavorite={onToggleFavorite}
            />
            <Offers
              config={config}
              email={email}
              name={name || undefined}
              answers={answers.filter(Boolean) as ArchetypeId[]}
              winner={winner}
              attemptId={attemptId}
            />
            <Proof />
            <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
              <button type="button" onClick={startQuiz} className="btn btn-ghost">
                Retake the quiz
              </button>
            </div>
          </>
        ) : null}
      </main>

      <Footer />

      <AccountSheet
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        favorites={favorites}
        onRemoveFavorite={(id) => setFavorites(removeFavorite(id))}
        accountsEnabled={config?.features.accounts ?? false}
        defaultEmail={email}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
