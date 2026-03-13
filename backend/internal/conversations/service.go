package conversations

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jc/pabot/internal/db"
	"github.com/jc/pabot/internal/wallet"
)

type Conversation struct {
	ID             uuid.UUID
	TenantID       uuid.UUID
	UserID         uuid.UUID
	WindowStart    time.Time
	WindowExpiry   time.Time
	Category       string
}

type Message struct {
	Sender    string
	Content   string
	CreatedAt time.Time
}

type Service struct {
	db     *db.DB
	wallet *wallet.Service
}

func NewService(database *db.DB, walletSvc *wallet.Service) *Service {
	return &Service{db: database, wallet: walletSvc}
}

// GetOrCreateWindow returns the active conversation window for a user.
// If no active window exists, it creates one and deducts 1 credit.
// Returns (conversation, creditDeducted, error).
func (s *Service) GetOrCreateWindow(ctx context.Context, tenantID, userID uuid.UUID) (*Conversation, bool, error) {
	// Check for existing active window
	conv, err := s.getActive(ctx, userID, tenantID)
	if err == nil {
		return conv, false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, false, fmt.Errorf("get active conversation: %w", err)
	}

	// No active window — check balance before creating
	ok, err := s.wallet.HasBalance(ctx, tenantID)
	if err != nil {
		return nil, false, fmt.Errorf("check wallet balance: %w", err)
	}
	if !ok {
		return nil, false, wallet.ErrInsufficientBalance
	}

	// Create new window
	conv, err = s.createWindow(ctx, tenantID, userID, "service")
	if err != nil {
		return nil, false, fmt.Errorf("create conversation window: %w", err)
	}

	// Deduct credit (after window created so we can reference the conversation ID)
	if err := s.wallet.DeductCredit(ctx, tenantID, "conversation_window", &conv.ID); err != nil {
		// Credit deduction failed — this is a critical error but window already exists
		// Log and continue; the window is created, admin can reconcile
		return conv, false, fmt.Errorf("deduct credit after window creation: %w", err)
	}

	return conv, true, nil
}

// GetRecentMessages returns the last N messages for a conversation (for AI context).
func (s *Service) GetRecentMessages(ctx context.Context, conversationID uuid.UUID) ([]Message, error) {
	rows, err := s.db.Pool.Query(ctx, db.QueryGetRecentMessages, conversationID)
	if err != nil {
		return nil, fmt.Errorf("query messages: %w", err)
	}
	defer rows.Close()

	var messages []Message
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.Sender, &m.Content, &m.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan message: %w", err)
		}
		messages = append(messages, m)
	}

	// Reverse so oldest is first (chronological for AI context)
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	return messages, rows.Err()
}

func (s *Service) getActive(ctx context.Context, userID, tenantID uuid.UUID) (*Conversation, error) {
	row := s.db.Pool.QueryRow(ctx, db.QueryGetActiveConversation, userID, tenantID)
	c := &Conversation{}
	err := row.Scan(&c.ID, &c.TenantID, &c.UserID, &c.WindowStart, &c.WindowExpiry, &c.Category)
	if err != nil {
		return nil, err
	}
	return c, nil
}

func (s *Service) createWindow(ctx context.Context, tenantID, userID uuid.UUID, category string) (*Conversation, error) {
	c := &Conversation{TenantID: tenantID, UserID: userID, Category: category}
	err := s.db.Pool.QueryRow(ctx, db.QueryCreateConversation, tenantID, userID, category).
		Scan(&c.ID, &c.WindowStart, &c.WindowExpiry)
	if err != nil {
		return nil, err
	}
	return c, nil
}
