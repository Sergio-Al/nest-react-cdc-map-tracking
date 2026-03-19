FROM golang:1.24.13-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -ldflags="-s -w" -o /integration-service ./cmd/server

FROM alpine:3.19
RUN apk --no-cache add ca-certificates tzdata
COPY --from=build /integration-service /integration-service
EXPOSE 8090
ENTRYPOINT ["/integration-service"]
