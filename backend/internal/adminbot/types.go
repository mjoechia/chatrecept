package adminbot

import "time"

type WaitlistMember struct {
	Name      string
	Email     string
	Telegram  string
	CreatedAt time.Time
}

type WebBotUser struct {
	TelegramUserID int64
	Credits        int
	SiteCount      int
}

type Stats struct {
	WaitlistTotal int
	SitesLive     int
	WebBotUsers   int
}

type adminSession struct {
	state         string
	pendingUserID int64
}

const (
	stateIdle           = ""
	stateAwaitingAdd    = "add"
	stateAwaitingRemove = "remove"
	stateAwaitingTopupID  = "topup_id"
	stateAwaitingTopupAmt = "topup_amt"
	stateAwaitingCreditsID = "credits"
)
