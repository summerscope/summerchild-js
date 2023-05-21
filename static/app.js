import {
  Component,
  html,
  render,
} from "https://cdnjs.cloudflare.com/ajax/libs/htm/3.1.1/preact/standalone.module.min.js";

const debug = window.location.hash == "#debug";

const QUESTION_DATA_URL = "questions.json";
const INITIAL_QUESTION_ID = "Q1";

const SESSION_STORE_KEY = "quizState";

// return first line and rest of a multiline string
function splitFirstLine(text) {
  const i = text.indexOf("\n");

  if (i < 0) {
    return [text, ""];
  } else {
    return [text.slice(0, i), text.slice(i + 1)];
  }
}

// parse range of format "00-99"
function parseRange(text) {
  const [a, b] = text.split("-");
  return [parseInt(a), parseInt(b)];
}

// compute the maximum number of questions remaining,
// for every question we use dynamic programming
// to make this efficient
function maxQuestionsRemaining(fuel, cache, questions, id) {
  if (fuel <= 0) return 0; // abort when we have looked too deep, maybe there are cycles in the data?
  if (!id) return 0; // base case: zero questions remain if id is blank
  if (cache.has(id)) return cache.get(id); // if answer is cached return that

  const question = questions.get(id);
  let n_max = 0;

  // calculate the max remaining questions for each answer
  for (const answer of Object.values(question.answers)) {
    const n = maxQuestionsRemaining(fuel - 1, cache, questions, answer.nextq);
    if (n > n_max) {
      n_max = n;
    }
  }

  cache.set(id, n_max + 1);
  return n_max + 1;
}

class App extends Component {
  constructor(props) {
    super(props);

    this.state = {
      loading: true,
      error: false,
      questions: [],
      results: null,
      currentQuestion: INITIAL_QUESTION_ID,
      quizFinished: false,
      multiplier: 1.0,
      score: 0.0,
      recommendations: [],
    };

    this.maxQuestions = 0;
    this.questionsRemaining = new Map();
  }

  async componentDidMount() {
    const response = await fetch(QUESTION_DATA_URL);

    if (!response.ok) {
      this.setState({
        loading: false,
        error: true,
      });
      return;
    }

    const json = await response.json();
    const questions = new Map(json.map((q) => [q.id, q]));
    const results = questions.get("Results").results;

    this.setState({
      loading: false,
      questions: questions,
      results: results,
    });

    this.maxQuestions = maxQuestionsRemaining(
      50,
      this.questionsRemaining,
      questions,
      this.state.currentQuestion
    );
    this.loadSessionState();
    window.addEventListener("popstate", this.onPopState);
  }

  componentWillUnmount() {
    window.removeEventListener(this.onPopState);
  }

  saveState(state) {
    this.setState(state);
    this.saveSessionState(state);
    window.history.pushState(state, "");
  }

  onPopState = (event) => {
    this.loadSavedState(event.state);
    this.saveSessionState(event.state);
  };

  saveSessionState(state) {
    window.sessionStorage.setItem(SESSION_STORE_KEY, JSON.stringify(state));
  }

  loadSessionState() {
    const value = window.sessionStorage.getItem(SESSION_STORE_KEY);
    const json = JSON.parse(value);

    if (json) {
      this.loadSavedState(json);
    }
  }

  loadSavedState(state) {
    this.setState({
      currentQuestion: state.currentQuestion,
      quizFinished: state.quizFinished,
      multiplier: state.multiplier,
      score: state.score,
      recommendations: state.recommendations,
    });
  }

  onStartOver = (event) => {
    event.preventDefault();
    this.saveState({
      currentQuestion: INITIAL_QUESTION_ID,
      quizFinished: false,
      multiplier: 1.0,
      score: 0.0,
      recommendations: [],
    });
  };

  onDebugJumpToEnd = (event) => {
    event.preventDefault();
    this.setState({
      loading: false,
      error: false,
    });
    this.saveState({
      currentQuestion: undefined,
      quizFinished: true,
      multiplier: 0.5,
      score: 50,
      recommendations: [
        "Graceful degredation.\nAdd a feature flag or other automation process that allows you to turn it off in production, if issues arise. Consider, for example, building a simple business logic version as a fall-back, to keep the system running.",
        "System auditability.\nFor system decisions or classifications, especially high stakes ones, provide a record of the system decison (email, PDF, text message, etc), including a unique ID that can be traced in your system log.",
      ],
    });
  };

  onDebugLoadingState = (event) => {
    event.preventDefault();
    this.setState({
      loading: true,
      error: false,
    });
  };

  onDebugErrorState = (e) => {
    e.preventDefault();
    this.setState({
      loading: false,
      error: true,
    });
  };

  render(props, state) {
    let body;

    if (state.loading) {
      body = this.renderLoading();
    } else if (state.error) {
      body = this.renderError();
    } else if (state.quizFinished) {
      body = this.renderQuizFinished(state);
    } else {
      body = this.renderCurrentQuestion(state);
    }

    let header = html`<div class="logo">
      <img src="grumpy.png" /><span>sweet summer child score</span>
    </div>`;

    let footer = html`<a href="#" class="restart" onClick=${this.onStartOver}
      >☜ Start Over</a
    >`;

    if (debug) {
      footer = html`
        ${footer}<br />
        <a href="#" onClick=${this.onDebugJumpToEnd}>Jump to End (Debug)</a>
        <a href="#" onClick=${this.onDebugLoadingState}
          >Show Loading State (Debug)</a
        >
        <a href="#" onClick=${this.onDebugErrorState}
          >Show Error State (Debug)</a
        >
      `;
    }

    return html`
      <header key="footer">${header}</header>
      <main key="body">${body}</main>
      <footer key="footer">${footer}</footer>
    `;
  }

  renderLoading() {
    return html`<p>Loading...</p>`;
  }

  renderError() {
    return html`<p>Load Error!</p>`;
  }

  renderRecommendation(text) {
    const [titleText, bodyText] = splitFirstLine(text);

    return html`
      <h4>${titleText}</h4>
      <p>${bodyText}</p>
      <br />
    `;
  }

  getResultForScore(state, score) {
    return Object.entries(state.results).find(([key, res]) => {
      let [a, b] = parseRange(res.range);
      return a <= score && score <= b;
    });
  }

  renderQuizFinished(state) {
    const finalScore = 99 - state.multiplier * state.score;
    const [key, result] = this.getResultForScore(state, finalScore);

    return html`
      <h1>
        <span class="large">${Math.round(finalScore)}</span><br />
        Your Final Score
      </h1>
      <h4>${result.title} [${result.range}]</h4>
      <br />
      <blockquote>${result.text}</blockquote>
      <br /><br />
      <h2>Recommendations:</h2>
      <ul>
        ${state.recommendations.map(
          (text) => html` <li>${this.renderRecommendation(text)}</li> `
        )}
      </ul>
    `;
  }

  renderCurrentQuestion(state) {
    const onAnswer = (e, answer) => {
      e.preventDefault();
      this.saveState({
        currentQuestion: answer.nextq,
        quizFinished: !answer.nextq,
        multiplier: answer.multiplier || state.multiplier,
        score: state.score + (answer.score || 0),
        recommendations: answer.recommendation
          ? [...state.recommendations, answer.recommendation]
          : state.recommendations,
      });
    };

    const question = state.questions.get(state.currentQuestion);
    const remaining = this.questionsRemaining.get(state.currentQuestion);
    const percentage = Math.round(100 * (1 - remaining / this.maxQuestions));

    return html`
      <${Question} question=${question} onAnswer=${onAnswer} />
      <div class="debug">
        multiplier: ${state.multiplier}
        <br />
        accumulated points: ${state.score}
        <br />
        questions left: ${remaining}
        <br />
        percentage complete: ${percentage}%
      </div>
    `;
  }
}

function Question(props) {
  const question = props.question;
  const [titleText, bodyText] = splitFirstLine(question.text);

  return html`
    <h1>${titleText}</h1>
    <p>${bodyText}</p>
    <ul>
      ${Object.entries(question.answers).map(
        ([key, answer]) => html`
          <li>
            <a href="#" onClick=${(e) => props.onAnswer(e, answer)}
              >${answer.text}</a
            >
          </li>
        `
      )}
    </ul>
  `;
}

render(html`<${App} />`, document.body);
