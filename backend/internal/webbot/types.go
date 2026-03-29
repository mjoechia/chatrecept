package webbot

// SiteSpec is the structured data extracted from a user's description.
type SiteSpec struct {
	SiteName     string   `json:"site_name"`
	Industry     string   `json:"industry"`
	City         string   `json:"city"`         // empty string if not mentioned
	Services     []string `json:"services"`
	Style        string   `json:"style"` // modern | minimal | bold | elegant
	ContactType  string   `json:"contact_type"` // whatsapp | telegram | email | phone
	ContactValue string   `json:"contact_value"`
	Tagline      string   `json:"tagline"`
}

// Session is the in-memory view of a user's conversation state.
type Session struct {
	TelegramUserID int64
	TelegramChatID int64
	State          string
	Mode           int
	Draft          map[string]string
	CurrentSiteID  string
}

// Site represents a generated website record.
type Site struct {
	ID           string
	SiteName     string
	Industry     string
	Services     []string
	ContactType  string
	ContactValue string
	Style        string
	LogoURL      string
	SiteURL      string
	CFProject    string
	EditCount    int
	MaxEdits     int
	Status       string
}

const (
	StateIdle               = "idle"
	StateAwaitingDesc       = "awaiting_description"
	StateAwaitingName       = "awaiting_name"
	StateAwaitingServices   = "awaiting_services"
	StateAwaitingContact    = "awaiting_contact"
	StateGenerating         = "generating"

	ModeOneQuestion   = 1
	ModeThreeQuestion = 2
)
