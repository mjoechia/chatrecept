package ai

// Router holds both AI providers and returns the right one based on tenant language.
// Use Router.For(language) in the webhook pipeline; never instantiate providers per-request.
type Router struct {
	english Provider // Claude — strong English, paid per token
	chinese Provider // GLM-4-Flash — native Chinese + English, free
}

func NewRouter(english, chinese Provider) *Router {
	return &Router{english: english, chinese: chinese}
}

// For returns the Provider for the given language code.
// "zh" → GLM. Anything else (including "en" or empty) → Claude.
func (r *Router) For(language string) Provider {
	if language == "zh" {
		return r.chinese
	}
	return r.english
}
