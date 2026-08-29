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
import { OrderStatusPanel } from './components/OrderStatus';
import { Quiz } from './components/Quiz';
import { Result } from './components/Result';
import {
  Atmosphere,
  ToastProvider,
  usePetals,
  useToast,
} from './components/primitives';
import { track, trackOnce } from './lib/analytics';
import { getConfig, saveQuizResult, type AppConfig } from './lib/api';
import {
  getFavorites,
  getSession,
  removeFavorite,
  saveSession,
  toggleFavorite,
  type Favorite,
} from './lib/storage';

/**
 * There is deliberately no capture step between the quiz and the result.
 *
 * An email gate in front of the payoff was the single biggest drop in the
 * funnel: this traffic arrives from short-form video with no intent to sign up
 * for anything, and asking before delivering lost people who would otherwise
 * have seen their archetype and scrolled to the offers. The address is still
 * collected — at the point of purchase, where it is needed to deliver the
 * product and where the reader has already decided they want something.
 */
type Stage = 'landing' | 'quiz' | 'result';

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
  // Only ever set by a returning buyer's stored session now; the quiz no
  // longer asks. Offers falls back to its own field when this is null.
  const [email, setEmail] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutReturn | null>(
    () => returnState.current.checkout,
  );

  const archetype = getArchetype(winner);
  const score = useMemo(() => scoreQuiz(answers), [answers]);

  /* --------------------------------------------------------------- boot */

  useEffect(() => {
    // The top of the funnel, and the denominator for every rate on the
    // dashboard. `trackOnce` because StrictMode runs this effect twice.
    trackOnce('page_view', 'page_view');
    if (returnState.current.checkout?.cancelled) {
      trackOnce('checkout_cancelled', 'checkout_cancelled');
    }

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

  /*
   * Tracked from the stage rather than from revealResult, because a reader
   * returning from Stripe lands straight on the result without passing
   * through it.
   */
  useEffect(() => {
    if (stage === 'result') trackOnce('result_view', 'result_view', { archetype: winner });
  }, [stage, winner]);

  /* --------------------------------------------------------------- flow */

  const startQuiz = useCallback(() => {
    // Two separate events: pressing the button, and the questionnaire actually
    // appearing. They should be equal — a gap between them is a bug worth
    // seeing rather than a copy problem.
    track('quiz_cta_click');
    track('quiz_start');
    setAnswers(Array(QUESTIONS.length).fill(null));
    setStage('quiz');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const answerQuestion = useCallback((index: number, choice: ArchetypeId) => {
    // Once per question, not once per tap: changing an answer is the same
    // person still on the same question.
    trackOnce(`question:${index}`, 'question_answered', {
      step: index + 1,
      archetype: choice,
    });
    setAnswers((current) => {
      const next = [...current];
      next[index] = choice;
      return next;
    });
  }, []);

  /*
   * Takes the finished answers from the quiz rather than reading them back out
   * of state. The seventh answer both records itself and ends the quiz, so the
   * state update behind it has not necessarily committed by the time this runs
   * — reading `answers` here would score six answers out of seven.
   */
  const finishQuiz = useCallback((filled: ArchetypeId[]) => {
    const result = scoreQuiz(filled);

    track('quiz_complete', { archetype: result.winner });
    setWinner(result.winner);
    saveSession({ answers: filled, winner: result.winner });

    // Saved without an address, and without waiting. The attempt is worth
    // recording either way, but the reveal is the reward and nothing should
    // stand between finishing the quiz and seeing it — including a round trip.
    void saveQuizResult({ answers: filled, winningArchetype: result.winner })
      .then((saved) => {
        setAttemptId(saved.attemptId);
        saveSession({ attemptId: saved.attemptId });
      })
      .catch(() => undefined);

    setStage('result');
    window.scrollTo({ top: 0, behavior: 'auto' });
    window.setTimeout(() => petals(), 400);
  }, [petals]);

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
