# Hoàn Tiền DV — Cashback Platform

Nền tảng hoàn tiền/hoa hồng tiếp thị cho khách mua hàng qua Shopee, TikTok Shop và Lazada. Khách dán link sản phẩm, hệ thống nhận diện sàn và tạo link theo dõi riêng; đơn hàng và hoa hồng thật được admin xác nhận thủ công tại khu quản trị.

> Tài liệu này mô tả đúng hệ thống **đang thực sự chạy** (`apps/web`). Nếu bạn thấy bản README cũ nói tới Postgres/Express/Docker — đó là bản nháp ban đầu của dự án, đã được thay thế hoàn toàn bằng kiến trúc Firebase dưới đây.

## Kiến trúc thật

- **Next.js 14 (App Router), xuất tĩnh (`output: 'export'`)** — không có server Next.js chạy nền, toàn bộ là file HTML/JS/CSS tĩnh.
- **Firebase Hosting** phục vụ các file tĩnh đó — dự án nằm trên gói **Spark (miễn phí)**, không dùng Cloud Functions, không có backend riêng nào cả.
- **Firestore (Native mode)** là toàn bộ "backend" — mọi dữ liệu (đơn hàng, ví, voucher, phiên đăng nhập, log admin...) đọc/ghi trực tiếp từ trình duyệt qua Firebase Client SDK.
- **Firestore Security Rules** (`firestore.rules`) là ranh giới bảo mật thật — không có API server nào để kiểm tra quyền, mọi kiểm soát truy cập nằm ở đây.
- **Firebase Authentication** — khách đăng ký bằng email/mật khẩu hoặc Google; admin bắt buộc đăng nhập bằng Google và chỉ 2 email cố định trong whitelist mới có quyền admin (xem phần "Quyền admin" bên dưới).
- `apps/api` (Express + Prisma + Postgres) là **bản nháp cũ, không còn dùng** — không deploy, không kết nối với `apps/web`. Có thể xoá an toàn nếu muốn dọn repo, không ảnh hưởng gì tới hệ thống đang chạy.

## Cấu trúc thư mục quan trọng

```text
cashback-platform/
├── apps/
│   └── web/                  ← ứng dụng THẬT đang chạy
│       ├── app/               (trang khách + /manager/* trang admin)
│       ├── components/
│       ├── lib/                (auth, Firestore helpers, tiện ích)
│       └── .env.local          (cấu hình Firebase — không commit)
├── firebase.json              ← cấu hình Hosting + Firestore
├── firestore.rules            ← ranh giới bảo mật thật
└── firestore.indexes.json     ← index Firestore cần cho các truy vấn
```

## Cài đặt & chạy local

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
# điền đầy đủ giá trị Firebase (xem hướng dẫn ngay trong .env.example)
cd apps/web
npm run dev
```

Mặc định chạy ở `http://localhost:3000`. Các giá trị Firebase trong `.env.local` là public-by-design (được bảo vệ bởi Firestore Rules, không phải bằng cách giấu key).

## Deploy

```bash
cd apps/web
npm run build          # xuất file tĩnh vào apps/web/out
cd ../..
firebase deploy --only hosting
```

Nếu có sửa `firestore.rules` hoặc `firestore.indexes.json`, deploy riêng:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

> Lưu ý: đây là **hành động ảnh hưởng tới trang web thật đang chạy** — luôn kiểm tra kỹ trước khi deploy, không có bước "staging" riêng trong thiết lập hiện tại.

## Quyền admin

- Chỉ 2 email cố định (`quangnamttp@gmail.com`, `hoantiendv@gmail.com`) có thể là admin — hard-code ở cả `lib/auth.tsx` (`BOOTSTRAP_ADMIN_EMAILS`) lẫn `firestore.rules` (`isAdmin()`), kiểm tra 2 lớp độc lập.
- **Không có** giao diện "cấp quyền admin cho tài khoản khác" ở bất kỳ đâu — trường `role` trên tài khoản không thể sửa sau khi tạo (Firestore Rules chặn). Muốn thêm admin thứ 3 phải sửa code + rules rồi deploy lại.
- Admin bắt buộc đăng nhập bằng nút "Tiếp tục với Google" ở `/manager/login`.

## Giới hạn có chủ đích (đọc kỹ trước khi vận hành)

Đây là những giới hạn **đã biết và được chấp nhận** — không phải lỗi, không cần "sửa", chỉ cần admin hiểu rõ khi vận hành hàng ngày:

1. **Không tích hợp API affiliate thật của Shopee/TikTok Shop/Lazada.** Đã kiểm tra trực tiếp bằng link affiliate thật (xem chú thích trong `lib/redirectLink.ts`, hàm `buildAffiliateUrl`) — link affiliate thật của các sàn chứa token ký số riêng do chính sàn sinh ra, không có cách nào tạo lại từ client-side mà không gọi API có khoá bí mật (không an toàn trên web tĩnh không server). **Vì vậy: mọi đơn hàng và số hoa hồng thật đều do admin tự nhập tay ở `/manager/orders`**, dựa trên báo cáo/đối soát riêng của admin với từng sàn. Hệ thống không tự động biết một đơn có thật hay hoa hồng bao nhiêu.
2. **Ảnh + tên sản phẩm thật ở `/get-cashback-link` phụ thuộc dịch vụ ngoài miễn phí (`api.microlink.io`).** Hoạt động tốt với Lazada; **Shopee chặn việc lấy ảnh/tên thật** (trang sản phẩm Shopee luôn trả về dữ liệu chung chung cho bot, không phải trang trình duyệt thật) — khi đó hệ thống tự động dùng icon sàn + tên chung chung thay thế, đây là hành vi đúng thiết kế, không phải lỗi.
3. **Tài khoản đăng nhập bằng Google không có mật khẩu** — mục "Đổi mật khẩu" ở `/settings` tự ẩn và hiện thông báo giải thích cho nhóm tài khoản này (không phải lỗi hiển thị).
4. **Chat hỗ trợ Telegram chỉ 1 chiều** — tin nhắn khách được đẩy sang nhóm Telegram để admin biết ngay, nhưng admin trả lời phải trả lời trực tiếp trên web (`/manager/support-chat`), gõ trên Telegram sẽ không tự động hiện lại cho khách (cần backend mới làm được 2 chiều).
5. **Ảnh gửi trong chat hỗ trợ tự xoá sau 3 ngày** — lưu trực tiếp trong Firestore (không qua Drive chung, vì Drive là của riêng từng khách), giới hạn 650KB/ảnh để tránh phình dữ liệu.
6. **`redirectCache` dùng cửa sổ tái sử dụng trượt 7 ngày, giới hạn cứng 30 ngày** kể từ lúc tạo — khách dán lại đúng 1 link nhiều lần trong khoảng đó vẫn ra đúng 1 mã theo dõi duy nhất (đã kiểm tra kỹ, xem chú thích trong code — việc này giúp việc đối soát của admin nhất quán hơn, không bị tính là spam).

## Vận hành hàng ngày (dành cho admin)

Menu quản trị (`/manager`) theo đúng thứ tự công việc thường làm:

| Trang | Việc chính |
|---|---|
| Tổng quan | Số liệu tổng hợp toàn hệ thống |
| Đơn hàng | Nhập đơn thật + duyệt/từ chối đơn "Chờ duyệt" (tab riêng) |
| Cashback / Hoa hồng | Xem lịch sử toàn bộ khoản đã chia (khách/giới thiệu/ví admin) |
| Ví tổng Admin | Số dư phần 20% hệ thống giữ lại |
| Tiếp thị liên kết & Voucher | Tạo/sửa voucher mạng xã hội hiển thị cho khách |
| Rút tiền | Duyệt yêu cầu rút tiền của khách |
| Duyệt hoàn tiền | Giải phóng khoản hoa hồng đang giữ (không giới hạn thời gian chờ) |
| Giới thiệu | Theo dõi thưởng giới thiệu bạn bè |
| Hỗ trợ khách hàng | Trả lời chat trực tiếp với khách |
| Chống gian lận | Cảnh báo tự động khi đơn bị trả hàng sau khi đã xác nhận/giải phóng |
| Phiên đăng nhập | Xem & buộc đăng xuất thiết bị đang đăng nhập |
| Cấu hình | Tỷ lệ hoàn tiền hiển thị, sao lưu nhật ký ra Google Drive |
| Nhật ký | Toàn bộ hành động admin đã thực hiện (tự động ghi) |

## Kiểm tra trước khi deploy

```bash
cd apps/web
npx tsc --noEmit     # phải sạch tuyệt đối, 0 lỗi
npx next build        # phải build thành công, 0 lỗi (1 cảnh báo ESLint về <img> là bình thường, không phải lỗi)
```
